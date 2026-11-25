#!/usr/bin/env python3
"""The Lean referee: a small HTTP server in front of the Lean REPL (PROTOTYPE, written by Claude).

Runs on the Lean machine (Interlinea-proto, infra/terraform/lean_server.tf). The gate Lambda forwards the
browser's requests here; every request carries the shared token in X-Lean-Token. Standard library only.

    GET  /health   {"ok", "ready", "idle_seconds", "idle_limit"}   (doesn't count as activity)
    POST /touch    the player is still here: restart the idle clock
    POST /check    {"lhs": tree, "rhs": tree, "rule": "add_smul"} -> {"ok", "lean", "errors"}
                   (trees and rules: render.py)
                   A live proof (the Lean tab), also through /check so the gate needs no new routes:
                   {"session": "start", "start": tree, "goal": tree} -> {"ok", "sid", "theorem", "goals"}
                   {"session": "step", "sid", "from": tree, "to": tree, "hint": [rules]}
                       -> {"ok", "goals", "done", "verified", "tactic"} (on a refused step the proof stays put)

After --idle-minutes with no /touch or /check, the machine shuts itself down (on AWS that terminates it).

Local use, with Lean installed (lean/scripts/setup.sh):
    LEAN_TOKEN=dev python3 server/referee.py --no-shutdown
    curl -H 'X-Lean-Token: dev' localhost:8787/health
    python3 server/referee.py --selftest      # a few known moves through the real REPL, then exit
"""

import argparse
import hmac
import json
import os
import select
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import render  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LEAN_DIR = os.path.join(ROOT, "lean")
IMPORTS = "import Leangame"
MAX_BODY = 64 * 1024
CHECK_SECONDS = 30
RESTART_AFTER = 2000  # commands; the REPL keeps every environment it made


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


class Repl:
    """One `lake exe repl` process. Commands go in as JSON followed by a blank line, and each answer comes back
    the same way."""

    def __init__(self, lean_dir=LEAN_DIR):
        self.lean_dir = lean_dir
        self.lock = threading.Lock()
        self.proc = None
        self.env = None
        self.count = 0
        self.error = None
        self.restarts = 0

    def start(self):
        self.stop()
        log("starting the Lean REPL")
        t = time.time()
        self.proc = subprocess.Popen(["lake", "exe", "repl"], cwd=self.lean_dir, stdin=subprocess.PIPE,
                                     stdout=subprocess.PIPE, bufsize=0)
        self.buf = b""
        r = self._send({"cmd": IMPORTS}, timeout=600)
        errs = [m for m in r.get("messages", []) if m.get("severity") == "error"]
        if "env" not in r or errs:
            raise RuntimeError(f"importing Leangame failed: {errs or r}")
        self.env = r["env"]
        self.count = 0
        self.restarts += 1
        log(f"REPL ready in {time.time() - t:.1f}s")

    def stop(self):
        if self.proc:
            self.proc.kill()
            self.proc.wait()
        self.proc = None
        self.env = None

    def _send(self, obj, timeout):
        self.proc.stdin.write((json.dumps(obj) + "\n\n").encode())
        self.proc.stdin.flush()
        deadline = time.time() + timeout
        out = self.proc.stdout.fileno()
        while b"\n\n" not in self.buf:
            left = deadline - time.time()
            if left <= 0:
                raise TimeoutError("Lean took too long")
            ready, _, _ = select.select([out], [], [], left)
            if ready:
                chunk = os.read(out, 65536)
                if not chunk:
                    raise RuntimeError("the REPL exited")
                self.buf += chunk
        text, self.buf = self.buf.split(b"\n\n", 1)
        return json.loads(text)

    def raw(self, obj, timeout=CHECK_SECONDS):
        """Send any REPL request (a command in the imported environment, or a tactic on a proof state)."""
        with self.lock:
            if self.env is None or self.count >= RESTART_AFTER:
                self.start()
            self.count += 1
            if "cmd" in obj:
                obj = dict(obj, env=self.env)
            try:
                return self._send(obj, timeout=timeout)
            except Exception:
                self.stop()
                raise

    def run(self, cmd):
        """Run one command in the imported environment; returns the error messages (none: it checked)."""
        with self.lock:
            if self.env is None or self.count >= RESTART_AFTER:
                self.start()
            self.count += 1
            try:
                r = self._send({"cmd": cmd, "env": self.env}, timeout=CHECK_SECONDS)
            except Exception:
                self.stop()  # a stuck or dead REPL: start a fresh one next time
                raise
        msgs = r.get("messages", [])
        errors = [m.get("data", "") for m in msgs if m.get("severity") == "error"]
        if "message" in r:  # the REPL's own error (e.g. the command didn't parse)
            errors.append(r["message"])
        if any("sorry" in m.get("data", "") for m in msgs):
            errors.append("the proof used sorry")
        return errors

    @property
    def ready(self):
        return self.env is not None


class State:
    def __init__(self, repl, token, idle_seconds):
        self.repl = repl
        self.token = token
        self.idle_seconds = idle_seconds
        self.last = time.time()

    def touch(self):
        self.last = time.time()

    def idle(self):
        return time.time() - self.last


def check(repl, body):
    try:
        cmd = render.move(body.get("lhs"), body.get("rhs"), body.get("rule"))
    except render.BadInput as e:
        return 400, {"ok": False, "error": str(e)}
    try:
        errors = repl.run(cmd)
    except Exception as e:
        log("check failed:", e)
        return 503, {"ok": False, "error": f"Lean: {e}"}
    return 200, {"ok": not errors, "lean": cmd, "errors": errors[:3]}


class Sessions:
    """Live proofs: each is the theorem, its REPL proof state, and the tactics so far. Proof states live in the
    REPL process, so a REPL restart ends every session (the client starts a new one)."""

    def __init__(self, repl):
        self.repl = repl
        self.live = {}
        self.n = 0
        self.lock = threading.Lock()

    @staticmethod
    def goals_of(r):
        if "goals" in r:
            return r["goals"]
        return [x.get("goal", "") for x in r.get("sorries", [])]

    @staticmethod
    def errors_of(r):
        errs = [m.get("data", "") for m in r.get("messages", []) if m.get("severity") == "error"]
        if "message" in r:
            errs.append(r["message"])
        return errs

    def start(self, body):
        head = render.theorem(body.get("start"), body.get("goal"))
        r = self.repl.raw({"cmd": head + "\n  sorry"})
        errs = self.errors_of(r)
        sorries = r.get("sorries", [])
        if errs or not sorries:
            return 422, {"ok": False, "error": (errs or ["Lean found no goal"])[0][:400]}
        with self.lock:
            self.n += 1
            sid = f"s{self.n}"
            if len(self.live) > 50:
                self.live.pop(next(iter(self.live)))
            self.live[sid] = {"ps": sorries[0]["proofState"], "head": head, "tactics": [], "restarts": self.repl.restarts}
        return 200, {"ok": True, "sid": sid, "theorem": head, "goals": self.goals_of(r)}

    def step(self, body):
        s = self.live.get(body.get("sid"))
        if not s or s["restarts"] != self.repl.restarts:
            return 409, {"ok": False, "error": "session ended: start again"}
        tac = render.step(body.get("from"), body.get("to"), body.get("hint"))
        r = self.repl.raw({"tactic": tac, "proofState": s["ps"]})
        errs = self.errors_of(r)
        if errs or "proofState" not in r:
            return 200, {"ok": False, "error": (errs or ["Lean refused the step"])[0][:400], "goals": None}
        s["ps"] = r["proofState"]
        s["tactics"].append(tac)
        goals = self.goals_of(r)
        out = {"ok": True, "goals": goals, "done": not goals, "tactic": tac}
        if not goals:
            # the whole proof, compiled from scratch: no errors and no sorry
            full = s["head"] + "".join("\n  " + t for t in s["tactics"])
            errors = self.repl.run(full)
            out["verified"] = not errors
            if errors:
                out["verify_error"] = errors[0][:400]
        return 200, out


def session(sessions, body):
    try:
        if body.get("session") == "start":
            return sessions.start(body)
        if body.get("session") == "step":
            return sessions.step(body)
        return 400, {"ok": False, "error": "session is start or step"}
    except render.BadInput as e:
        return 400, {"ok": False, "error": str(e)}
    except Exception as e:
        log("session failed:", e)
        return 503, {"ok": False, "error": f"Lean: {e}"}


def make_handler(state):
    class Handler(BaseHTTPRequestHandler):
        server_version = "leangame-referee"

        def log_message(self, fmt, *args):
            log(self.address_string(), fmt % args)

        def reply(self, code, obj):
            data = json.dumps(obj).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def authorized(self):
            got = self.headers.get("X-Lean-Token", "")
            if state.token and hmac.compare_digest(got.encode(), state.token.encode()):
                return True
            self.reply(401, {"ok": False, "error": "unauthorized"})
            return False

        def do_GET(self):
            if not self.authorized():
                return
            if self.path == "/health":
                return self.reply(200, {"ok": True, "ready": state.repl.ready, "error": state.repl.error,
                                        "idle_seconds": round(state.idle()), "idle_limit": state.idle_seconds})
            self.reply(404, {"ok": False, "error": "not found"})

        def do_POST(self):
            if not self.authorized():
                return
            n = int(self.headers.get("Content-Length") or 0)
            if n > MAX_BODY:
                return self.reply(413, {"ok": False, "error": "too large"})
            try:
                body = json.loads(self.rfile.read(n) or b"{}")
                if not isinstance(body, dict):
                    raise ValueError
            except ValueError:
                return self.reply(400, {"ok": False, "error": "body must be a JSON object"})
            if self.path == "/touch":
                state.touch()
                return self.reply(200, {"ok": True, "ready": state.repl.ready})
            if self.path == "/check":
                state.touch()
                if "session" in body:
                    return self.reply(*session(state.sessions, body))
                return self.reply(*check(state.repl, body))
            self.reply(404, {"ok": False, "error": "not found"})

    return Handler


def watchdog(state, shutdown_cmd):
    while True:
        time.sleep(15)
        if state.idle() > state.idle_seconds:
            log(f"idle for {round(state.idle())}s: shutting down")
            if shutdown_cmd:
                subprocess.run(shutdown_cmd, shell=True)
                return
            state.touch()  # --no-shutdown: just say so, once per idle period


def selftest():
    """A few moves with known answers, through the real REPL."""
    s, n, v, u = (lambda x: {"s": x}), (lambda x: {"n": x}), (lambda x: {"v": x}), {"v": "u"}
    a, b, w = s("a"), s("b"), v("v")
    cases = [
        ("distribute (a+b)v", {"smul": [{"add": [a, b]}, w]}, {"add": [{"smul": [a, w]}, {"smul": [b, w]}]}, "add_smul", True),
        ("factor av+bv", {"add": [{"smul": [a, w]}, {"smul": [b, w]}]}, {"smul": [{"add": [a, b]}, w]}, "add_smul", True),
        ("wrong law", {"smul": [{"add": [a, b]}, w]}, {"add": [{"smul": [a, w]}, {"smul": [b, w]}]}, "smul_add", False),
        ("a(u+v)", {"smul": [a, {"add": [u, w]}]}, {"add": [{"smul": [a, u]}, {"smul": [a, w]}]}, "smul_add", True),
        ("reorder u+v", {"add": [u, w]}, {"add": [w, u]}, "add_comm", True),
        ("reorder ab", {"mul": [a, b]}, {"mul": [b, a]}, "mul_comm", True),
        ("2+2 is 4", {"smul": [{"add": [n(2), n(2)]}, w]}, {"smul": [n(4), w]}, "arith", True),
        ("2+2 is not 5", {"smul": [{"add": [n(2), n(2)]}, w]}, {"smul": [n(5), w]}, "arith", False),
        ("-v = (-1)v", {"smul": [n(-1), w]}, {"neg": w}, "neg_one_smul", True),
        ("second term", {"add": [u, {"smul": [{"add": [a, b]}, w]}]},
         {"add": [u, {"add": [{"smul": [a, w]}, {"smul": [b, w]}]}]}, "add_smul", True),
    ]
    repl = Repl()
    repl.start()
    bad = 0
    for name, lhs, rhs, rule, want in cases:
        t = time.time()
        errors = repl.run(render.move(lhs, rhs, rule))
        got = not errors
        mark = "ok  " if got == want else "FAIL"
        bad += got != want
        print(f"{mark} {name}: {'checks' if got else 'rejected'} ({time.time() - t:.2f}s)"
              + ("" if got == want or not errors else f"\n     {errors[0][:300]}"), flush=True)
    # a live proof: (a + b)v + 0 → (a + b)v → av + bv, the goal; a wrong step in between is refused
    ss = Sessions(repl)
    t = time.time()
    lhs0 = {"add": [{"smul": [{"add": [a, b]}, w]}, {"zero": True}]}
    mid = {"smul": [{"add": [a, b]}, w]}
    goal = {"add": [{"smul": [a, w]}, {"smul": [b, w]}]}
    code, st = ss.start({"start": lhs0, "goal": goal})
    sid = st.get("sid")
    checks = [
        ("live: start", code == 200 and st.get("ok") and len(st.get("goals", [])) == 1),
        ("live: a wrong step is refused", not ss.step({"sid": sid, "from": lhs0, "to": {"smul": [a, w]}})[1]["ok"]),
    ]
    r1 = ss.step({"sid": sid, "from": lhs0, "to": mid, "hint": ["add_zero"]})[1]
    checks.append(("live: + 0 absorbed, one goal left", r1.get("ok") and len(r1.get("goals") or []) == 1 and not r1.get("done")))
    r2 = ss.step({"sid": sid, "from": mid, "to": goal, "hint": ["add_smul"]})[1]
    checks.append(("live: distributing reaches the goal: no goals", r2.get("ok") and r2.get("done")))
    checks.append(("live: the whole proof compiles", r2.get("verified") is True))
    zv = {"smul": [n(0), w]}
    code, st3 = ss.start({"start": {"add": [zv, {"neg": zv}]}, "goal": {"zero": True}})
    r4 = ss.step({"sid": st3.get("sid"), "from": {"add": [zv, {"neg": zv}]}, "to": {"zero": True}, "hint": ["add_neg_cancel"]})[1]
    checks.append(("live: a group and its −(…) cancel to 0", r4.get("ok") and r4.get("done") and r4.get("verified")))
    code, st4 = ss.start({"start": {"smul": [{"mul": [n(2), {"inv": n(2)}]}, w]}, "goal": {"smul": [n(1), w]}})
    r5 = ss.step({"sid": st4.get("sid"), "from": {"smul": [{"mul": [n(2), {"inv": n(2)}]}, w]}, "to": {"smul": [n(1), w]}, "hint": ["arith"]})[1]
    checks.append(("live: 2·2⁻¹ becomes 1 (norm_num, characteristic 0)", r5.get("ok") and r5.get("done") and r5.get("verified")))
    code, st2 = ss.start({"start": {"add": [u, w]}, "goal": {"add": [w, u]}})
    r3 = ss.step({"sid": st2.get("sid"), "from": {"add": [u, w]}, "to": {"add": [w, u]}})[1]
    checks.append(("live: rearranging a sum is a step (ac_rfl)", r3.get("ok") and r3.get("done") and r3.get("verified")))
    for name, good in checks:
        bad += not good
        print(f"{'ok  ' if good else 'FAIL'} {name}", flush=True)
    if any(not g for _, g in checks):
        print("     details:", json.dumps({"start": st, "r1": r1, "r2": r2, "r3": r3, "r4": r4, "r5": r5})[:3000], flush=True)
    print(f"live proof: {time.time() - t:.2f}s", flush=True)
    repl.stop()
    print("selftest:", "passed" if not bad else f"{bad} failed")
    return 1 if bad else 0


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--port", type=int, default=8787)
    p.add_argument("--idle-minutes", type=float, default=10)
    p.add_argument("--shutdown-cmd", default="shutdown -h now")
    p.add_argument("--no-shutdown", action="store_true", help="never shut the machine down (local use)")
    p.add_argument("--selftest", action="store_true")
    args = p.parse_args()
    if args.selftest:
        sys.exit(selftest())

    token = os.environ.get("LEAN_TOKEN", "")
    if not token:
        sys.exit("set LEAN_TOKEN")
    repl = Repl()
    state = State(repl, token, args.idle_minutes * 60)
    state.sessions = Sessions(repl)

    def warm():
        try:
            with repl.lock:
                repl.start()
        except Exception as e:
            repl.error = str(e)
            log("REPL failed to start:", e)
    threading.Thread(target=warm, daemon=True).start()
    threading.Thread(target=watchdog, args=(state, None if args.no_shutdown else args.shutdown_cmd),
                     daemon=True).start()
    log(f"referee on :{args.port}, idle limit {args.idle_minutes} min")
    ThreadingHTTPServer(("0.0.0.0", args.port), make_handler(state)).serve_forever()


if __name__ == "__main__":
    main()
