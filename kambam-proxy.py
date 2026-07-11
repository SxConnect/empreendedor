from http.server import HTTPServer, BaseHTTPRequestHandler
import urllib.request

UPSTREAM = 'http://127.0.0.1/login'
EXTRA_HEADERS = {
    'Remote-User': 'admin',
    'Remote-Email': 'admin@local',
    'Remote-Name': 'Admin',
}

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        req = urllib.request.Request(UPSTREAM)
        for k, v in EXTRA_HEADERS.items():
            req.add_header(k, v)
        with urllib.request.urlopen(req, timeout=15) as r:
            body = r.read()
            self.send_response(r.status)
            for k, v in r.getheaders():
                if k.lower() in ('content-type',):
                    self.send_header(k, v)
            self.end_headers()
            self.wfile.write(body)

if __name__ == '__main__':
    HTTPServer(('127.0.0.1', 9001), Handler).serve_forever()
