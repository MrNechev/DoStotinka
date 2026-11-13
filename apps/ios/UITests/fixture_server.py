"""A tiny stand-in for a DoStotinka server for the UI test: /api/health and a fake web app."""
import http.server
import json
import os
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixture")


class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/api/health":
            return self.send(200, "application/json", json.dumps({"status": "ok", "version": "test"}).encode())
        if path.startswith("/api/"):
            return self.send(404, "application/json", b"{}")
        file = os.path.join(ROOT, path.lstrip("/")) if path.startswith("/assets/") else os.path.join(ROOT, "index.html")
        if not os.path.isfile(file):
            return self.send(404, "text/plain", b"not found")
        kind = "text/javascript" if file.endswith(".js") else "text/html; charset=utf-8"
        with open(file, "rb") as f:
            self.send(200, kind, f.read())

    def send(self, status, kind, body):
        self.send_response(status)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


http.server.ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1])), Handler).serve_forever()
