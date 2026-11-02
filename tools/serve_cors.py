"""Local server (127.0.0.1 only) that lets the Supabase dashboard read the SQL files in ../supabase.
Used once to load the initial contacts. Not deployed."""
import functools, http.server, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent / "supabase"


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "https://supabase.com")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Methods", "GET")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.end_headers()


http.server.ThreadingHTTPServer(("127.0.0.1", 8767), functools.partial(Handler, directory=str(ROOT))).serve_forever()
