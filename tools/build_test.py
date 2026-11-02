"""Builds test.html (local test page with simulated Supabase). Not deployed: it is in .gitignore and .vercelignore."""
import json, pathlib, re

root = pathlib.Path(__file__).resolve().parent.parent
page = (root / "index.html").read_text(encoding="utf-8")
sql = (root / "supabase" / "2-contactos.sql").read_text(encoding="utf-8")
seed = []
S = r"'((?:[^']|'')*)'"
SRC = {"wa": "Google Maps · WhatsApp", "fi": "Google Maps · Teléfono fijo", "sp": "Google Maps · Sin teléfono"}
for m in re.finditer(r"^\(" + S + r",(\d+)," + S + "," + S + "," + S + "," + S + "," + S + r"\),?$", sql, re.M):
    id_, seq, city, cat, name, phone, notes = m.groups()
    u = lambda x: x.replace("''", "'")
    seed.append(["leads", u(id_), {"seq": int(seq), "name": u(name), "city": u(city), "category": u(cat), "phone": u(phone), "notes": u(notes),
                 "source": SRC[id_[:2]], "mapsUrl": "", "stage": "nuevo", "owner": None, "priority": "media", "nextAction": "", "nextDate": "",
                 "service": "", "value": 0, "contactName": "", "email": "", "social": "", "lostReason": "", "createdAt": "2026-11-01T12:00:00.000Z",
                 "createdBy": None, "updatedAt": "2026-11-01T12:00:00.000Z", "updatedBy": None, "lastContactAt": None}])
assert len(seed) == 467, len(seed)
import importlib.util
_spec = importlib.util.spec_from_file_location("plantillas", root / "tools" / "plantillas.py")
_pl = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(_pl)
seed = [r for r in seed if r[0] != "templates"] + [["templates", i, {"name": n, "order": o, "body": b, "updatedAt": "2026-11-02T12:00:00Z", "updatedBy": None}] for i, n, o, b in _pl.ALL]
mock = (root / "tools" / "mock-supabase.js").read_text(encoding="utf-8")
cdn = '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js"></script>'
cfg = '<script src="js/config.js"></script>'
assert page.count(cdn) == 1 and page.count(cfg) == 1
page = page.replace(cdn, "<script>window.__SEED__=" + json.dumps(seed, ensure_ascii=False) + ";</script>\n<script>" + mock + "</script>")
page = page.replace(cfg, '<script>window.CRM_CONFIG={supabaseUrl:"https://demo.supabase.co",supabaseAnonKey:"demo"};</script>')
(root / "test.html").write_text(page, encoding="utf-8")
print("ok", len(seed))
