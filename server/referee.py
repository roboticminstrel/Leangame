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
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import render  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LEAN_DIR = os.path.join(ROOT, "lean")
IMPORTS = "import Leangame"
MAX_BODY = 64 * 1024
CHECK_SECONDS = 30
STEP_SECONDS = 120  # a live step: a slow refusal isn't a stuck REPL (killing it would end every live proof)
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
        hyps = body.get("hyps") or []
        mem = body.get("mem")
        if mem:
            if not isinstance(mem, dict):
                return 400, {"ok": False, "error": "mem is an object"}
            head = render.mem_theorem(body.get("start"), mem.get("ctx"), mem.get("mems") or [], scalars=mem.get("scalars") or [], vectors=mem.get("vectors") or [])
            hyps = []
        else:
            head = render.theorem(body.get("start"), body.get("goal"), hyps=hyps)
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
            self.live[sid] = {"ps": sorries[0]["proofState"], "head": head, "tactics": [], "restarts": self.repl.restarts, "nhyps": len(hyps), "obtained": [], "mem": mem.get("ctx") if mem else None}
        return 200, {"ok": True, "sid": sid, "theorem": head, "goals": self.goals_of(r)}

    def step(self, body):
        s = self.live.get(body.get("sid"))
        if not s or s["restarts"] != self.repl.restarts:
            return 409, {"ok": False, "error": "session ended: start again"}
        # the same step again (its answer was lost, e.g. the gate gave up waiting): answer it from memory rather than
        # run it twice
        key = body.get("seq")  # the step's place in the board's history: the same place again is a resend
        if key is not None and s.get("last") == key:
            return 200, s["lastOut"]
        wit = body.get("witness")
        if wit and wit.get("name") not in s["obtained"]:
            # a witness from the inverse axiom, first: obtain ⟨y, h⟩ (its hypothesis is the next h)
            if wit.get("h") != f"h{s['nhyps'] + 1}":
                return 400, {"ok": False, "error": f"the next hypothesis is h{s['nhyps'] + 1}"}
            otac = render.witness(wit.get("x"), wit.get("name"), wit.get("h"))
            r0 = self.repl.raw({"tactic": otac, "proofState": s["ps"]}, timeout=STEP_SECONDS)
            errs0 = self.errors_of(r0)
            if errs0 or "proofState" not in r0:
                return 200, {"ok": False, "error": (errs0 or ["Lean refused the witness"])[0][:400], "goals": None}
            s["ps"] = r0["proofState"]; s["tactics"].append(otac); s["nhyps"] += 1; s["obtained"].append(wit.get("name"))
        target = body.get("target") or {}
        if not isinstance(target, dict):
            return 400, {"ok": False, "error": "target is an object"}
        if s.get("mem"):
            if "row" not in target:
                return 400, {"ok": False, "error": "a move on a membership goal names its row"}
            tac = render.mem_step(target.get("row"), s["mem"], target.get("card"), body.get("from"), body.get("to"), body.get("hint"))
        elif target.get("goal"):
            tac = render.goal_step(body.get("from"), body.get("to"), body.get("hint"), s.get("nhyps", 0))
        elif target.get("hyp"):
            h = target.get("hyp")
            if not isinstance(h, str) or not render.HYP.match(h) or int(h[1:]) > s.get("nhyps", 0):
                return 400, {"ok": False, "error": "no such hypothesis"}
            tac = render.hyp_step(h, body.get("from"), body.get("to"), target.get("bind"), body.get("hint"), s.get("nhyps", 0))
        else:
            tac = render.step(body.get("from"), body.get("to"), body.get("hint"), s.get("nhyps", 0))
        t0 = time.time()
        r = self.repl.raw({"tactic": tac, "proofState": s["ps"]}, timeout=STEP_SECONDS)
        log(f"step {'ok' if 'proofState' in r and not self.errors_of(r) else 'refused'} in {time.time() - t0:.1f}s")
        errs = self.errors_of(r)
        if errs or "proofState" not in r:
            return 200, {"ok": False, "error": (errs or ["Lean refused the step"])[0][:400], "goals": None}
        s["ps"] = r["proofState"]
        s["last"] = key
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
        s["lastOut"] = out
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


# ---------- the Natural Number Game server (lean4game, scripts/nng-server.sh) on 127.0.0.1:8000 ----------
# The referee is the machine's only open door: requests under /nng/ (with the token, from the gate) are passed on to
# the game server, and count as activity for the idle shutdown.
NNG_PORT = 8000
NNG_BODY = 1 << 20
NNG_STATUS = os.environ.get("NNG_STATUS", "/tmp/leangame-nng.json")
NNG_HEADERS = ("Content-Type", "Accept", "Accept-Language")


def nng_state():
    """How far the game server is: None (not on this machine), building, failed, starting, or ready."""
    try:
        with open(NNG_STATUS) as f:
            st = json.load(f)
    except (OSError, ValueError):
        return None
    if st.get("state") in ("built", "starting"):
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{NNG_PORT}/api/config", timeout=1) as r:
                if r.status == 200:
                    return {"state": "ready", "detail": "The Natural Number Game is ready"}
        except (OSError, ValueError):
            pass
    return {"state": st.get("state"), "detail": st.get("detail", "")}


def nng_forward(method, path, headers, body):
    """One request to the game server: (status, headers, body)."""
    req = urllib.request.Request(f"http://127.0.0.1:{NNG_PORT}{path}", data=body if method not in ("GET", "HEAD") else None,
                                 method=method, headers={k: headers[k] for k in NNG_HEADERS if headers.get(k)})
    try:
        with urllib.request.urlopen(req, timeout=130) as r:  # a proof check may take up to 2 minutes
            return r.status, dict(r.headers), r.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()
    except OSError as e:
        return 502, {"Content-Type": "application/json"}, json.dumps({"error": f"the game server isn't answering ({e})"}).encode()


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

        def nng(self):
            """Pass a request under /nng/ on to the game server."""
            n = int(self.headers.get("Content-Length") or 0)
            if n > NNG_BODY:
                return self.reply(413, {"ok": False, "error": "too large"})
            body = self.rfile.read(n) if n else b""
            state.touch()
            code, headers, data = nng_forward(self.command, self.path[len("/nng"):] or "/", self.headers, body)
            self.send_response(code)
            for k in ("Content-Type", "Cache-Control", "Content-Language", "Last-Modified", "ETag"):
                v = next((headers[h] for h in headers if h.lower() == k.lower()), None)
                if v:
                    self.send_header(k, v)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_DELETE(self):
            if not self.authorized():
                return
            if self.path.startswith("/nng/"):
                return self.nng()
            self.reply(404, {"ok": False, "error": "not found"})

        def do_GET(self):
            if not self.authorized():
                return
            if self.path.startswith("/nng/"):
                return self.nng()
            if self.path == "/health":
                return self.reply(200, {"ok": True, "ready": state.repl.ready, "error": state.repl.error,
                                        "idle_seconds": round(state.idle()), "idle_limit": state.idle_seconds,
                                        "nng": nng_state()})
            self.reply(404, {"ok": False, "error": "not found"})

        def do_POST(self):
            if not self.authorized():
                return
            if self.path.startswith("/nng/"):
                return self.nng()
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
                r = subprocess.run(shutdown_cmd, shell=True)
                log("shutdown command exited", r.returncode)
                time.sleep(60)  # still here a minute later: it failed, try again next round
                continue
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
    # level 1, played the way the board sends it: 0v = 0v + 0 = 0v + (0v + −(0v)) = 0v + 0v + −(0v)
    # = (0 + 0)v + −(0v) = 0v + −(0v) = 0
    zv = {"smul": [n(0), w]}; nz = {"neg": zv}
    seq = [({"add": [zv, {"zero": True}]}, ["add_zero"]), ({"add": [zv, {"add": [zv, nz]}]}, ["add_neg_cancel"]),
           ({"add": [zv, zv, nz]}, None), ({"add": [{"smul": [{"add": [n(0), n(0)]}, w]}, nz]}, ["add_smul"]),
           ({"add": [zv, nz]}, ["add_zero"]), ({"zero": True}, ["add_neg_cancel"])]
    code, stl = ss.start({"start": zv, "goal": {"zero": True}})
    cur, rl = zv, {}
    for nxt, hint in seq:
        rl = ss.step({"sid": stl.get("sid"), "from": cur, "to": nxt, "hint": hint})[1]
        if not rl.get("ok"):
            break
        cur = nxt
    checks.append(("live: level 1 (0v = 0) played through to No goals, whole proof compiles", rl.get("ok") and rl.get("done") and rl.get("verified")))
    if not rl.get("done"):
        print("     level 1 stopped at", json.dumps(cur), "->", json.dumps(rl)[:600], flush=True)
    # level 1.32, with 1.30 unlocked: (−1)v → (−1)v + 0 → (−1)v + (v + −v) → (−1)v + v + −v → (−1)v + 1v + −v
    # → (−1 + 1)v + −v → 0v + −v → 0 + −v → −v
    m1 = {"smul": [n(-1), w]}; nv = {"neg": w}
    seq2 = [({"add": [m1, {"zero": True}]}, ["add_zero"]), ({"add": [m1, {"add": [w, nv]}]}, ["add_neg_cancel"]),
            ({"add": [m1, w, nv]}, None), ({"add": [m1, {"smul": [n(1), w]}, nv]}, ["mul_one", "one_smul"]),
            ({"add": [{"smul": [{"add": [n(-1), n(1)]}, w]}, nv]}, ["add_smul"]),
            ({"add": [{"smul": [n(0), w]}, nv]}, ["add_neg_cancel"]), ({"add": [{"zero": True}, nv]}, ["zero_smul"]), (nv, ["add_zero"])]
    code, stm = ss.start({"start": m1, "goal": nv})
    cur, rm = m1, {}
    for nxt, hint in seq2:
        rm = ss.step({"sid": stm.get("sid"), "from": cur, "to": nxt, "hint": hint})[1]
        if not rm.get("ok"):
            break
        cur = nxt
    checks.append(("live: level 1.32 ((−1)v = −v) played through, whole proof compiles", rm.get("ok") and rm.get("done") and rm.get("verified")))
    if not rm.get("done"):
        print("     level 1.32 stopped at", json.dumps(cur), "->", json.dumps(rm)[:600], flush=True)
    # level 1.27: (h1 : v + w = 0) (h2 : v + w2 = 0) : w = w2, the way the board plays it:
    # w → w + 0 → w + (v + w2) → w + v + w2 → v + w + w2 → 0 + w2 → w2
    W, W2, Z = {"v": "w"}, {"v": "w2"}, {"zero": True}
    hy = [[{"add": [w, W]}, Z], [{"add": [w, W2]}, Z]]
    seq3 = [({"add": [W, Z]}, ["add_zero"]), ({"add": [W, {"add": [w, W2]}]}, ["h2"]), ({"add": [W, w, W2]}, None),
            ({"add": [w, W, W2]}, None), ({"add": [Z, W2]}, ["h1"]), (W2, ["add_zero"])]
    code, stu = ss.start({"start": W, "goal": W2, "hyps": hy})
    cur, ru = W, {}
    for nxt, hint in seq3:
        ru = ss.step({"sid": stu.get("sid"), "from": cur, "to": nxt, "hint": hint})[1]
        if not ru.get("ok"):
            break
        cur = nxt
    checks.append(("live: level 1.27 (unique inverse, with hypotheses h1 h2) played through, whole proof compiles", ru.get("ok") and ru.get("done") and ru.get("verified")))
    if not ru.get("done"):
        print("     level 1.27 stopped at", json.dumps(cur), "->", json.dumps(ru)[:600], json.dumps(stu)[:300], flush=True)
    # factoring two terms that aren't next to each other: 0v + −(0v) + 0v → (0 + 0)v + −(0v) (a player's 1.30)
    zv0 = {"smul": [n(0), w]}
    code, sf = ss.start({"start": zv0, "goal": {"zero": True}})
    sidf = sf.get("sid")
    pre = [({"add": [zv0, {"zero": True}]}, ["add_zero"]), ({"add": [zv0, {"add": [{"neg": zv0}, zv0]}]}, ["add_neg_cancel"]),
           ({"add": [zv0, {"neg": zv0}, zv0]}, None)]
    cur, rf = zv0, {}
    for nxt, hint in pre:
        rf = ss.step({"sid": sidf, "from": cur, "to": nxt, "hint": hint})[1]
        cur = nxt
    # the board sends it as two steps: bring the pair together (bracketed), then the law
    mid = {"add": [{"add": [zv0, zv0]}, {"neg": zv0}]}
    rf0 = ss.step({"sid": sidf, "from": cur, "to": mid, "hint": None})[1]
    rf = ss.step({"sid": sidf, "from": mid, "to": {"add": [{"smul": [{"add": [n(0), n(0)]}, w]}, {"neg": zv0}]}, "hint": ["add_smul"]})[1]
    rf = rf if rf0.get("ok") else rf0
    checks.append(("live: factoring terms that aren't neighbours (0v + −(0v) + 0v → (0v + 0v) + −(0v) → (0 + 0)v + −(0v))", rf.get("ok")))
    if not rf.get("ok"):
        print("     non-adjacent factor:", json.dumps(rf)[:1500], flush=True)
    # a step Lean can't prove is refused quickly (it used to take 30-40 s, and the REPL was restarted as stuck)
    code, sq = ss.start({"start": w, "goal": {"zero": True}})
    t0 = time.time()
    rq = ss.step({"sid": sq.get("sid"), "from": w, "to": {"add": [w, w]}, "hint": ["add_smul"]})[1]  # v = v + v: false
    took = time.time() - t0
    checks.append((f"live: a wrong step is refused quickly ({took:.1f}s, under 15)", not rq.get("ok") and took < 15))
    # factoring a bare v with −1·v (a player's 1.32): v is first written 1·v, then the law
    m1v, nvv = {"smul": [n(-1), w]}, {"neg": w}
    code, sb = ss.start({"start": {"add": [m1v, w, nvv]}, "goal": nvv})
    rb1 = ss.step({"sid": sb.get("sid"), "from": {"add": [m1v, w, nvv]}, "to": {"add": [m1v, {"smul": [n(1), w]}, nvv]}, "hint": ["one_smul"]})[1]
    rb2 = ss.step({"sid": sb.get("sid"), "from": {"add": [m1v, {"smul": [n(1), w]}, nvv]}, "to": {"add": [{"smul": [{"add": [n(-1), n(1)]}, w]}, nvv]}, "hint": ["add_smul"]})[1]
    checks.append(("live: factoring a bare v (−1v + v + −v → −1v + 1v + −v → (−1 + 1)v + −v)", rb1.get("ok") and rb2.get("ok")))
    if not (rb1.get("ok") and rb2.get("ok")):
        print("     bare v:", json.dumps(rb1)[:600], json.dumps(rb2)[:600], flush=True)
    # level 1.34, the goal with content: -u ∈ U from the three conditions: -u → (-1)u (1.32), hs, hu
    uu = {"v": "u"}
    code, sm = ss.start({"start": {"neg": uu}, "mem": {"ctx": "closed", "mems": ["u"]}})
    m1 = ss.step({"sid": sm.get("sid"), "from": {"neg": uu}, "to": {"smul": [n(-1), uu]}, "hint": ["neg_one_smul"], "target": {"row": 0}})[1]
    m2 = ss.step({"sid": sm.get("sid"), "target": {"row": 0, "card": "hs"}})[1]
    m3 = ss.step({"sid": sm.get("sid"), "target": {"row": 0, "card": "hu"}})[1]
    checks.append(("live: 1.34's -u ∈ U (1.32, then closure under scalars, then hu), whole proof compiles", m1.get("ok") and m2.get("ok") and m3.get("ok") and m3.get("done") and m3.get("verified")))
    if not m3.get("done"):
        print("     1.34 -u:", json.dumps(sm)[:400], json.dumps(m1)[:400], json.dumps(m2)[:300], json.dumps(m3)[:300], flush=True)
    # u + w ∈ U by ha: two goals; the second row first (hw), then the first (hu)
    ww = {"v": "w"}
    code, sa = ss.start({"start": {"add": [uu, ww]}, "mem": {"ctx": "closed", "mems": ["u", "w"]}})
    a1 = ss.step({"sid": sa.get("sid"), "target": {"row": 0, "card": "ha"}})[1]
    a2 = ss.step({"sid": sa.get("sid"), "target": {"row": 1, "card": "hw"}})[1]
    a3 = ss.step({"sid": sa.get("sid"), "target": {"row": 0, "card": "hu"}})[1]
    checks.append(("live: two goals at once (ha splits u + w; close the second, then the first)", a1.get("ok") and a2.get("ok") and a3.get("done") and a3.get("verified")))
    if not a3.get("done"):
        print("     1.34 split:", json.dumps(sa)[:300], json.dumps(a1)[:300], json.dumps(a2)[:300], json.dumps(a3)[:300], flush=True)
    # and from the book's definition (h : IsSubspace F U): a·u ∈ U
    aa = {"s": "b"}
    code, sh = ss.start({"start": {"smul": [aa, uu]}, "mem": {"ctx": "subspace", "mems": ["u"]}})
    b1 = ss.step({"sid": sh.get("sid"), "target": {"row": 0, "card": "h.smul"}})[1]
    b2 = ss.step({"sid": sh.get("sid"), "target": {"row": 0, "card": "hu"}})[1]
    checks.append(("live: from the book's definition (h : IsSubspace F U), b·u ∈ U", b1.get("ok") and b2.get("done") and b2.get("verified")))
    if not b2.get("done"):
        print("     1.34 h:", json.dumps(sh)[:400], json.dumps(b1)[:300], json.dumps(b2)[:300], flush=True)
    # level 1.26: (h1 : ∀ x : V, x + o = x) : o = 0, the book's way: o → o + 0 → 0 + o → 0
    O, X = {"v": "o"}, {"v": "x"}
    seq26 = [({"add": [O, {"zero": True}]}, ["add_zero"]), ({"add": [{"zero": True}, O]}, None), ({"zero": True}, ["h1"])]
    code, st26 = ss.start({"start": O, "goal": {"zero": True}, "hyps": [[{"add": [X, O]}, X, "x"]]})
    cur, r26 = O, {}
    for nxt, hint in seq26:
        r26 = ss.step({"sid": st26.get("sid"), "from": cur, "to": nxt, "hint": hint})[1]
        if not r26.get("ok"):
            break
        cur = nxt
    checks.append(("live: level 1.26 (unique 0, a ∀ hypothesis) played through, whole proof compiles", r26.get("ok") and r26.get("done") and r26.get("verified")))
    if not r26.get("done"):
        print("     level 1.26 stopped at", json.dumps(cur), "->", json.dumps(r26)[:600], json.dumps(st26)[:300], flush=True)
    # level 1.26 again, with a hypothesis move and a goal move: h1 : ∀ x, x + o = x becomes ∀ x, o + x = x
    # (replace h1); the goal 0 becomes o + 0 (by the new h1, backward); the expression o becomes o + 0: they meet
    code, sg = ss.start({"start": O, "goal": {"zero": True}, "hyps": [[{"add": [X, O]}, X, "x"]]})
    sid = sg.get("sid")
    rh = ss.step({"sid": sid, "from": [{"add": [X, O]}, X], "to": [{"add": [O, X]}, X], "hint": None, "target": {"hyp": "h1", "bind": "x"}})[1]
    rg1 = ss.step({"sid": sid, "from": {"zero": True}, "to": {"add": [O, {"zero": True}]}, "hint": ["h1"], "target": {"goal": True}})[1]
    rg2 = ss.step({"sid": sid, "from": O, "to": {"add": [O, {"zero": True}]}, "hint": ["add_zero"]})[1]
    checks.append(("live: a hypothesis move (replace h1) and a goal move, then the goal meets the expression", rh.get("ok") and rg1.get("ok") and rg2.get("ok") and rg2.get("done") and rg2.get("verified")))
    if not rg2.get("done"):
        print("     hyp/goal moves:", json.dumps(rh)[:400], json.dumps(rg1)[:400], json.dumps(rg2)[:400], flush=True)
    # level 1.30 without negatives: 0v → 0v + 0 → (obtain y1, h1 : 0v + y1 = 0) 0v + (0v + y1) → 0v + 0v + y1
    # → (0 + 0)v + y1 → 0v + y1 → 0
    Y = {"v": "y1"}
    seq4 = [({"add": [zv, {"zero": True}]}, ["add_zero"], None),
            ({"add": [zv, {"add": [zv, Y]}]}, ["h1"], {"x": zv, "name": "y1", "h": "h1"}),
            ({"add": [zv, zv, Y]}, None, None), ({"add": [{"smul": [{"add": [n(0), n(0)]}, w]}, Y]}, ["add_smul"], None),
            ({"add": [zv, Y]}, ["add_zero"], None), ({"zero": True}, ["h1"], None)]
    code, stw = ss.start({"start": zv, "goal": {"zero": True}})
    cur, rw_ = zv, {}
    for nxt, hint, wit in seq4:
        rw_ = ss.step({"sid": stw.get("sid"), "from": cur, "to": nxt, "hint": hint, "witness": wit})[1]
        if not rw_.get("ok"):
            break
        cur = nxt
    checks.append(("live: level 1.30 by the inverse axiom's witness (no −), whole proof compiles", rw_.get("ok") and rw_.get("done") and rw_.get("verified")))
    if not rw_.get("done"):
        print("     1.30 by witness stopped at", json.dumps(cur), "->", json.dumps(rw_)[:600], flush=True)
    # level 1.31: a0 = 0 the same way: a0 → a0 + 0 → a0 + (a0 + y1) → a0 + a0 + y1 → a(0 + 0) + y1 → a0 + y1 → 0
    A = {"s": "a"}; a0 = {"smul": [A, {"zero": True}]}
    seq5 = [({"add": [a0, {"zero": True}]}, ["add_zero"], None),
            ({"add": [a0, {"add": [a0, Y]}]}, ["h1"], {"x": a0, "name": "y1", "h": "h1"}),
            ({"add": [a0, a0, Y]}, None, None), ({"add": [{"smul": [A, {"add": [{"zero": True}, {"zero": True}]}]}, Y]}, ["smul_add"], None),
            ({"add": [a0, Y]}, ["add_zero"], None), ({"zero": True}, ["h1"], None)]
    code, sta = ss.start({"start": a0, "goal": {"zero": True}})
    cur, ra = a0, {}
    for nxt, hint, wit in seq5:
        ra = ss.step({"sid": sta.get("sid"), "from": cur, "to": nxt, "hint": hint, "witness": wit})[1]
        if not ra.get("ok"):
            break
        cur = nxt
    checks.append(("live: level 1.31 (a0 = 0) by the witness, whole proof compiles", ra.get("ok") and ra.get("done") and ra.get("verified")))
    if not ra.get("done"):
        print("     1.31 stopped at", json.dumps(cur), "->", json.dumps(ra)[:600], flush=True)
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
    p.add_argument("--shutdown-cmd", default="/usr/sbin/shutdown -h now || /sbin/shutdown -h now || systemctl poweroff")
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
