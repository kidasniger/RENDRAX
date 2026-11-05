from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
import json

ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / "docs"
CONFIG = json.loads((ROOT / "vercel.json").read_text(encoding="utf-8"))

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DOCS), **kwargs)

    def end_headers(self):
        path = urlsplit(self.path).path or "/"
        headers = {}
        for rule in CONFIG.get("headers", []):
            source = rule.get("source", "")
            matches = (
                source == "/(.*)"
                or source == path
                or (source == "/assets/(.*)" and path.startswith("/assets/"))
            )
            if matches:
                for item in rule.get("headers", []):
                    headers[item["key"]] = item["value"]
        for key, value in headers.items():
            self.send_header(key, value)
        super().end_headers()

if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", 4173), Handler).serve_forever()
