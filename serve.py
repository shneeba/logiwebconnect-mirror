#!/usr/bin/env python3
"""Static server for the logiwebconnect mirror, with SPA history-fallback.

Plain `python -m http.server` 404s on the app's client-side routes (/devices,
/select-receiver, /analytics, …) because no such file exists. The real site
serves index.html for any unmatched route; without that, a *hard* navigation
(e.g. switching receivers) dead-ends on a 404 and you have to refresh. This
reproduces the real server's behaviour:

  - existing file/dir            -> served normally
  - unmatched, extensionless path-> index.html  (SPA route)
  - unmatched, has an extension  -> 404          (a genuinely missing asset)
  - POST (only the stubbed telemetry hits this) -> 204, so it doesn't spam 501s

Pure standard library, no dependencies, still just `python3`.
"""
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get("PORT", "8765"))
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "mirror")


class SPAHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def send_head(self):
        fs_path = self.translate_path(self.path)
        if not os.path.exists(fs_path):
            name = os.path.basename(self.path.split("?", 1)[0].split("#", 1)[0])
            if "." not in name:            # routes are extensionless; assets aren't
                self.path = "/index.html"  # SPA fallback
        return super().send_head()

    def do_POST(self):                     # only the /_noop/ telemetry stub lands here
        self.send_response(204)
        self.end_headers()


if __name__ == "__main__":
    httpd = ThreadingHTTPServer(("", PORT), SPAHandler)
    print(f"serving {ROOT} on http://localhost:{PORT}  (SPA history-fallback enabled)")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
