"""The referee passes /nng/* on to the game server (lean4game), with the token, and counts it as activity."""
import json
import os
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import referee


class FakeGame(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def answer(self):
        n = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(n) if n else b""
        data = json.dumps({"method": self.command, "path": self.path, "body": body.decode(), "type": self.headers.get("Content-Type")}).encode()
        self.send_response(201 if self.command == "POST" else 200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    do_GET = do_POST = do_DELETE = answer


class Repl:
    ready, error = True, None


class Proxy(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.game = ThreadingHTTPServer(("127.0.0.1", 0), FakeGame)
        referee.NNG_PORT = cls.game.server_address[1]
        threading.Thread(target=cls.game.serve_forever, daemon=True).start()
        cls.state = referee.State(Repl(), "tok", 600)
        cls.ref = ThreadingHTTPServer(("127.0.0.1", 0), referee.make_handler(cls.state))
        threading.Thread(target=cls.ref.serve_forever, daemon=True).start()
        cls.base = f"http://127.0.0.1:{cls.ref.server_address[1]}"

    def call(self, method, path, body=None, token="tok"):
        req = urllib.request.Request(self.base + path, data=body, method=method,
                                     headers={"X-Lean-Token": token, "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=5) as r:
                return r.status, dict(r.headers), json.loads(r.read())
        except urllib.error.HTTPError as e:
            return e.code, dict(e.headers), json.loads(e.read())

    def test_forwards_with_method_path_body(self):
        self.state.last = time.time() - 100
        code, headers, out = self.call("POST", "/nng/api/lean/start/leangame/nng?x=1", b'{"a":1}')
        self.assertEqual(code, 201)
        self.assertEqual(out, {"method": "POST", "path": "/api/lean/start/leangame/nng?x=1", "body": '{"a":1}', "type": "application/json"})
        self.assertEqual(headers.get("Cache-Control"), "no-store")
        self.assertLess(self.state.idle(), 5, "a game request is activity")
        self.assertEqual(self.call("GET", "/nng/")[2]["path"], "/")
        self.assertEqual(self.call("DELETE", "/nng/api/lean/instances/7")[2]["method"], "DELETE")

    def test_needs_the_token(self):
        self.assertEqual(self.call("GET", "/nng/api/config", token="nope")[0], 401)

    def test_health_says_how_far_the_game_is(self):
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            f.write(json.dumps({"state": "building", "detail": "Building the Natural Number Game"}))
        referee.NNG_STATUS = f.name
        self.assertEqual(self.call("GET", "/health")[2]["nng"]["state"], "building")
        with open(f.name, "w") as g:
            g.write(json.dumps({"state": "starting", "detail": ""}))
        self.assertEqual(self.call("GET", "/health")[2]["nng"]["state"], "ready", "the server answers: ready")
        os.unlink(f.name)
        self.assertIsNone(self.call("GET", "/health")[2]["nng"])


if __name__ == "__main__":
    unittest.main()
