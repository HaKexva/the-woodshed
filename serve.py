#!/usr/bin/env python3
"""Local dev server that never lets the browser cache anything.

The stock `python3 -m http.server` sends Last-Modified and honours
If-Modified-Since, so browsers hold on to ES modules across edits and you end up
staring at a stale songbook wondering why a change did nothing. This sends
no-store on everything instead.

    ./serve.py [port]        # default 8642
"""

import sys
from functools import partial
from http.server import HTTPServer, SimpleHTTPRequestHandler


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def send_response(self, code, message=None):
        # drop Last-Modified so conditional requests can't produce a 304
        super().send_response(code, message)

    def send_header(self, keyword, value):
        if keyword.lower() == "last-modified":
            return
        super().send_header(keyword, value)

    def log_message(self, fmt, *args):
        if "200" not in (args[1] if len(args) > 1 else ""):
            super().log_message(fmt, *args)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8642
    print(f"serving {__file__.rsplit('/', 1)[0]} on http://localhost:{port} (no caching)")
    HTTPServer(("", port), partial(NoCacheHandler, directory=".")).serve_forever()
