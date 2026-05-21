#!/usr/bin/env python3
"""Simple browser display for headless Google aemu images (adb screencap refresh)."""
from http.server import BaseHTTPRequestHandler, HTTPServer
import subprocess
import time

HTML = b"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Zeppole emulator display</title>
<style>body{margin:0;background:#111;color:#eee;font-family:system-ui,sans-serif}
main{padding:1rem}img{max-width:100%;border:1px solid #333}</style></head>
<body><main><h1>Emulator display</h1>
<p>Live view via adb screencap. For automation use Appium on port 4723.</p>
<img id="f" alt="emulator screen"></main>
<script>const i=document.getElementById('f');setInterval(()=>{i.src='/frame.png?t='+Date.now()},800);</script>
</body></html>"""


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args: object) -> None:
        return

    def do_GET(self) -> None:
        if self.path.startswith("/frame.png"):
            try:
                png = subprocess.check_output(["adb", "exec-out", "screencap", "-p"], timeout=20)
            except Exception:
                self.send_error(503, "screencap failed")
                return
            self.send_response(200)
            self.send_header("Content-Type", "image/png")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(png)
            return
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(HTML)


def main() -> None:
    HTTPServer(("0.0.0.0", 6080), Handler).serve_forever()


if __name__ == "__main__":
    main()
