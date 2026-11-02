"""Builds test.html (local test page with simulated Supabase). Not deployed: it is in .gitignore and .vercelignore."""
import json, pathlib, re

root = pathlib.Path(__file__).resolve().parent.parent
page = (root / "index.html").read_text(encoding="utf-8")
sql = (root / "supabase" / "2-contactos.sql").read_text(encoding="utf-8")
seed = []
for m in re.finditer(r"\('((?:[^']|'')*)', '((?:[^']|'')*)', '((?:[^']|'')*)'::jsonb\)", sql):
    col, id_, data = (g.replace("''", "'") for g in m.groups())
    seed.append([col, id_, json.loads(data)])
mock = (root / "tools" / "mock-supabase.js").read_text(encoding="utf-8")
cdn = '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js"></script>'
cfg = '<script src="js/config.js"></script>'
assert page.count(cdn) == 1 and page.count(cfg) == 1
page = page.replace(cdn, "<script>window.__SEED__=" + json.dumps(seed, ensure_ascii=False) + ";</script>\n<script>" + mock + "</script>")
page = page.replace(cfg, '<script>window.CRM_CONFIG={supabaseUrl:"https://demo.supabase.co",supabaseAnonKey:"demo"};</script>')
(root / "test.html").write_text(page, encoding="utf-8")
print("ok", len(seed))
