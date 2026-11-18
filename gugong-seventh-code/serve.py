#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""《宫阙疑云：第七码》本地静态服
比 python -m http.server 更耐操：更大的 accept 队列、短连接（避免手机浏览器复用半死连接）、
正确的 MIME、gzip（.json/.js/.html 明显更小）、每次请求打一行日志。
"""
import os, sys, gzip, mimetypes, socketserver, http.server, time

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8123

GZIP_EXT = {'.html', '.js', '.json', '.css', '.svg', '.bin', '.md'}
mimetypes.add_type('text/javascript', '.js')
mimetypes.add_type('application/json', '.json')
mimetypes.add_type('model/gltf-binary', '.glb')
mimetypes.add_type('text/html', '.html')


class Handler(http.server.SimpleHTTPRequestHandler):
    protocol_version = 'HTTP/1.0'          # 短连接：手机浏览器不会再复用死掉的连接

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

    def do_GET(self):
        path = self.translate_path(self.path)
        if not os.path.isfile(path):
            return super().do_GET()
        ext = os.path.splitext(path)[1].lower()
        accept = self.headers.get('Accept-Encoding', '')
        ctype = mimetypes.guess_type(path)[0] or 'application/octet-stream'
        try:
            with open(path, 'rb') as f:
                data = f.read()
        except Exception:
            self.send_error(500)
            return
        use_gzip = ext in GZIP_EXT and 'gzip' in accept and len(data) > 1024
        if use_gzip:
            data = gzip.compress(data, 6)
        self.send_response(200)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(data)))
        if use_gzip:
            self.send_header('Content-Encoding', 'gzip')
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, fmt, *args):
        sys.stderr.write('%s %s\n' % (time.strftime('%H:%M:%S'), fmt % args))


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True
    request_queue_size = 256          # 关键：accept 队列从 5 提到 256


if __name__ == '__main__':
    os.chdir(ROOT)
    srv = Server(('0.0.0.0', PORT), Handler)
    print(f'宫阙疑云服：http://0.0.0.0:{PORT}/  根目录 {ROOT}', flush=True)
    srv.serve_forever()
