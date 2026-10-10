"""Quiet local preview server; paths are relative to the repository root."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import os

class Handler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

if __name__ == '__main__':
    os.chdir(Path(__file__).resolve().parent.parent)
    print('Shijing preview: http://127.0.0.1:4173', flush=True)
    ThreadingHTTPServer(('127.0.0.1', 4173), Handler).serve_forever()
