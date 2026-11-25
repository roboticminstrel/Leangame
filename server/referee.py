#!/usr/bin/env python3
"""The Lean referee: a small HTTP server in front of the Lean REPL (PROTOTYPE, written by Claude).

Runs on the Lean machine (Interlinea-proto, infra/terraform/lean_server.tf). The gate Lambda forwards the
browser's requests here; every request carries the shared token in X-Lean-Token. Standard library only.

    GET  /health   {"ok", "ready", "idle_seconds", "idle_limit"}   (doesn't count as activity)
    POST /touch    the player is still here: restart the idle clock
    POST /check    {"lhs": tree, "rhs": tree, "rule": "add_smul"} -> {"ok", "lean", "errors"}
                   (trees and rules: render.py)

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
