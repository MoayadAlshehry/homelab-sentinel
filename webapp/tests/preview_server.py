"""Offline frontend preview with fictional data. No real infrastructure is contacted.

Build frontend first, then run this file and visit http://127.0.0.1:18765.
Login is demo / demo. This fixture is excluded from the production Docker image.
"""
from datetime import datetime, timedelta, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import math
from pathlib import Path
from urllib.parse import urlsplit

DIST = Path(__file__).resolve().parents[1] / "frontend" / "dist"
TOKEN = "fictional-preview-only"


def fixture(path):
    now = datetime.now(timezone.utc)
    routes = {
        "/api/auth/me": {"id": 1, "username": "demo", "must_change_password": False},
        "/api/system/metrics": {"temperature_c": 44.2, "cpu_usage_pct": 12.6, "ram_used_gb": 2.1,
            "ram_total_gb": 8.0, "ram_used_pct": 26.3, "disks": [
                {"mountpoint": "/", "device": "example-disk", "fstype": "ext4", "used_gb": 55.5,
                 "total_gb": 240.0, "free_gb": 184.5, "used_pct": 23.1}]},
        "/api/containers": [{"id": str(i), "name": name, "state": "running", "status": "Up (fictional)", "image": "example:demo"}
            for i, name in enumerate(["sentinel-webapp", "prometheus", "grafana", "uptime-kuma", "socket-proxy", "node-exporter"])],
        "/api/monitoring/services": [{"id": i, "name": name, "status": "up"} for i, name in enumerate(["Example API", "Documentation", "Status page", "Demo service"])],
        "/api/network/events": [{"id": 1, "message": "Example workstation joined the demonstration network", "event_type": "JOINED", "timestamp": now.isoformat()}],
        "/api/monitoring/events": [{"id": 1, "service": "Example API", "status": "up", "message": "Example API health check passed", "timestamp": (now - timedelta(minutes=2)).isoformat()}],
        "/api/system/history": [{"time": (now - timedelta(minutes=23-i)).strftime("%H:%M"),
            "cpu": round(12 + 5 * math.sin(i/3), 1), "temp": round(44 + 2 * math.cos(i/4), 1),
            "ram": round(26 + math.sin(i/4), 1)} for i in range(24)],
    }
    return routes.get(path)


class Preview(SimpleHTTPRequestHandler):
    def do_POST(self):
        path = urlsplit(self.path).path
        if path != "/api/auth/login":
            self.send_error(405, "Offline preview is read-only")
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length < 1024:
                raise ValueError()
            credentials = json.loads(self.rfile.read(length))
        except (ValueError, TypeError):
            self.send_error(400)
            return
        if credentials != {"username": "demo", "password": "demo"}:
            self.reply({"detail": "Use the fictional demo / demo login."}, 401)
            return
        self.reply({"access_token": TOKEN, "username": "demo", "must_change_password": False})

    def reply(self, payload, status=200):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = urlsplit(self.path).path
        if path.startswith("/api/"):
            if self.headers.get("Authorization") != "Bearer " + TOKEN:
                self.reply({"detail": "Preview login required"}, 401)
                return
            data = fixture(path)
            self.reply(data if data is not None else {"detail": "No fixture for this route"}, 200 if data is not None else 404)
            return
        candidate = (DIST / path.lstrip("/")).resolve()
        if not candidate.is_relative_to(DIST.resolve()):
            self.send_error(404)
            return
        if not candidate.is_file():
            candidate = DIST / "index.html"
        body = candidate.read_bytes()
        content_type = self.guess_type(str(candidate))
        if candidate.name == "index.html":
            label = b'<div style="position:fixed;bottom:12px;left:12px;z-index:99999;padding:8px 12px;background:#f7f7f2;color:#17262d;border:1px solid #007f75;border-radius:8px;font:12px sans-serif">Offline preview &bull; fictional data</div>'
            body = body.replace(b"</body>", label + b"</body>")
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    if not (DIST / "index.html").is_file():
        raise SystemExit("Build webapp/frontend with npm run build first.")
    print("Offline fixture preview: http://127.0.0.1:18765 — demo / demo", flush=True)
    ThreadingHTTPServer(("127.0.0.1", 18765), Preview).serve_forever()
