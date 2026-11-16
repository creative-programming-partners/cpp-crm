"""Importador Hermes -> CRM de CPP.

Lee los Excel/CSV que generan los agentes de Hermes Desktop y los carga en el CRM (Supabase):
  - Prospector: Documents/CPP/prospectos/*.xlsx|csv  -> crea o actualiza prospectos (se van acumulando).
  - Vendedor:   Documents/CPP/mensajes/*.xlsx|csv    -> agrega los mensajes sugeridos al prospecto que coincide
                                                         por nombre + distrito.
No modifica nada de Hermes ni los archivos originales (solo los lee).

Uso:
  pythonw importador_hermes.py                 procesa lo nuevo y termina (lo usa la tarea programada)
  python  importador_hermes.py --simular DB    igual, pero contra una base local JSON (para probar)
  python  importador_hermes.py --configurar    genera la clave del usuario robot y la guarda en Windows
  python  importador_hermes.py --vaciar-crm --confirmo   respalda y borra TODOS los prospectos e historial
  python  importador_hermes.py --estado        muestra qué archivos ya se procesaron
Todo queda registrado en Documents/CPP/crm-importador/logs/importador.log
"""
import argparse
import csv
import ctypes
import datetime as dt
import hashlib
import io
import json
import os
import re
import secrets
import string
import subprocess
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

# ----------------------------------------------------------------- configuración
CPP_DIR = Path(os.environ.get("CPP_DIR", Path.home() / "Documents" / "CPP"))
PROSPECTOS_DIR = CPP_DIR / "prospectos"
MENSAJES_DIR = CPP_DIR / "mensajes"
WORK_DIR = CPP_DIR / "crm-importador"
STATE_FILE = WORK_DIR / "estado.json"
LOG_DIR = WORK_DIR / "logs"
BACKUP_DIR = WORK_DIR / "respaldos"
LOCK_FILE = WORK_DIR / "importador.lock"
REPO_DIR = Path(__file__).resolve().parent.parent
ROBOT_EMAIL = "hermes@cppcstudio.com"
CRED_TARGET = "CPP-CRM-Hermes"
STABLE_SECONDS = 90          # un archivo debe llevar este tiempo sin cambiar antes de leerlo
KEEP_BACKUPS = 40


# ----------------------------------------------------------------- utilidades
def norm(s):
    s = unicodedata.normalize("NFD", str(s or "")).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", s).strip().lower()


def key_of(name, district):
    return norm(name) + "|" + norm(district)


def lead_id(name, district):
    base = re.sub(r"[^a-z0-9]+", "-", norm(name)).strip("-")[:40] or "prospecto"
    return f"h-{base}-{hashlib.sha1(key_of(name, district).encode()).hexdigest()[:8]}"


def now_iso():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


EMPTY = {"", "sin verificar", "no verificado", "n/a", "na", "-", "--", "none", "null", "no aplica", "sin dato", "sin datos"}


def clean(v):
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    if isinstance(v, (dt.datetime, dt.date)):
        return v.strftime("%Y-%m-%d")
    s = re.sub(r"\s+", " ", str(v)).strip()
    return "" if norm(s) in EMPTY else s


def phone_display(raw):
    d = re.sub(r"\D", "", raw or "")
    if not d:
        return ""
    if len(d) == 9 and d.startswith("9"):
        d = "51" + d
    if len(d) == 11 and d.startswith("519"):
        return f"+51 {d[2:5]} {d[5:8]} {d[8:]}"
    if len(d) == 9 and d.startswith("01"):   # (01) 707-5944 -> Lima landline
        d = "511" + d[2:]
    if len(d) == 7:
        d = "511" + d
    if len(d) == 10 and d.startswith("511"):
        return f"+51 1 {d[3:6]} {d[6:]}"
    return raw.strip()


def split_phones(raw):
    """'967 724 753 / (01) 273-7705' -> ('+51 967 724 753', '(01) 273-7705'): main number (first mobile) + the rest."""
    parts = [p.strip() for p in re.split(r"\s*(?:/|,|;|\by\b|\bo\b|\|)\s*", clean(raw)) if re.sub(r"\D", "", p)]
    if not parts:
        return "", ""

    def is_mobile(p):
        d = re.sub(r"\D", "", p)
        return (len(d) == 9 and d.startswith("9")) or (len(d) == 11 and d.startswith("519"))

    main = next((p for p in parts if is_mobile(p)), parts[0])
    rest = " / ".join(p for p in parts if p is not main)
    return phone_display(main), rest


def social_url(v, kind):
    v = clean(v)
    if not v:
        return ""
    if v.lower().startswith(("http://", "https://")):
        return v
    handle = v.lstrip("@").strip("/")
    if re.fullmatch(r"[A-Za-z0-9_.]+", handle):
        return {"instagram": "https://www.instagram.com/", "facebook": "https://www.facebook.com/",
                "tiktok": "https://www.tiktok.com/@"}[kind] + handle
    return v


def to_number(v):
    m = re.search(r"\d+(?:[.,]\d+)?", clean(v).replace(" ", ""))
    return float(m.group().replace(",", ".")) if m else None


# ----------------------------------------------------------------- log y estado
def log(msg):
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    line = f"[{dt.datetime.now():%Y-%m-%d %H:%M:%S}] {msg}"
    with open(LOG_DIR / "importador.log", "a", encoding="utf-8") as f:
        f.write(line + "\n")
    try:
        print(line)
    except Exception:
        pass


def load_state():
    try:
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {"procesados": {}}


def save_state(state):
    WORK_DIR.mkdir(parents=True, exist_ok=True)
    tmp = STATE_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(STATE_FILE)


class Lock:
    def __enter__(self):
        WORK_DIR.mkdir(parents=True, exist_ok=True)
        if LOCK_FILE.exists() and time.time() - LOCK_FILE.stat().st_mtime < 30 * 60:
            raise SystemExit(0)  # otra ejecución sigue en curso
        LOCK_FILE.write_text(str(os.getpid()))
        return self

    def __exit__(self, *a):
        try:
            LOCK_FILE.unlink()
        except Exception:
            pass


# ----------------------------------------------------------------- credencial (Administrador de credenciales de Windows)
class _CRED(ctypes.Structure):
    _fields_ = [("Flags", ctypes.c_uint32), ("Type", ctypes.c_uint32), ("TargetName", ctypes.c_wchar_p),
                ("Comment", ctypes.c_wchar_p), ("LastWritten", ctypes.c_uint64), ("CredentialBlobSize", ctypes.c_uint32),
                ("CredentialBlob", ctypes.POINTER(ctypes.c_ubyte)), ("Persist", ctypes.c_uint32),
                ("AttributeCount", ctypes.c_uint32), ("Attributes", ctypes.c_void_p), ("TargetAlias", ctypes.c_wchar_p),
                ("UserName", ctypes.c_wchar_p)]


def cred_write(user, secret):
    blob = secret.encode("utf-16-le")
    buf = (ctypes.c_ubyte * len(blob)).from_buffer_copy(blob)
    c = _CRED(Type=1, TargetName=CRED_TARGET, UserName=user, CredentialBlobSize=len(blob),
              CredentialBlob=ctypes.cast(buf, ctypes.POINTER(ctypes.c_ubyte)), Persist=2)
    if not ctypes.windll.advapi32.CredWriteW(ctypes.byref(c), 0):
        raise ctypes.WinError()


def cred_read():
    p = ctypes.POINTER(_CRED)()
    if not ctypes.windll.advapi32.CredReadW(CRED_TARGET, 1, 0, ctypes.byref(p)):
        return None, None
    try:
        c = p.contents
        return c.UserName, ctypes.string_at(c.CredentialBlob, c.CredentialBlobSize).decode("utf-16-le")
    finally:
        ctypes.windll.advapi32.CredFree(p)


# ----------------------------------------------------------------- acceso a la base de datos
class Supabase:
    """Habla con el CRM real como el usuario robot (respeta las reglas de seguridad)."""

    def __init__(self):
        cfg = (REPO_DIR / "js" / "config.js").read_text(encoding="utf-8")
        self.url = re.search(r'supabaseUrl:\s*"([^"]+)"', cfg).group(1).rstrip("/")
        self.key = re.search(r'supabaseAnonKey:\s*"([^"]+)"', cfg).group(1)
        user, pwd = cred_read()
        if not pwd:
            raise RuntimeError("Falta la clave del usuario robot. Ejecuta: python importador_hermes.py --configurar")
        tok = self._req("POST", "/auth/v1/token?grant_type=password", {"email": user or ROBOT_EMAIL, "password": pwd}, auth=False)
        self.token = tok["access_token"]
        self.user_id = tok["user"]["id"]

    def _req(self, method, path, body=None, auth=True, headers=None):
        h = {"apikey": self.key, "Content-Type": "application/json"}
        if auth:
            h["Authorization"] = "Bearer " + self.token
        h.update(headers or {})
        data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
        for attempt in range(3):
            try:
                with urllib.request.urlopen(urllib.request.Request(self.url + path, data=data, method=method, headers=h), timeout=60) as r:
                    raw = r.read().decode("utf-8")
                    return json.loads(raw) if raw.strip() else None
            except urllib.error.HTTPError as e:
                detail = e.read().decode("utf-8", "replace")[:300]
                if e.code >= 500 and attempt < 2:
                    time.sleep(3 * (attempt + 1))
                    continue
                raise RuntimeError(f"{method} {path.split('?')[0]} -> {e.code}: {detail}")
            except urllib.error.URLError as e:
                if attempt < 2:
                    time.sleep(3 * (attempt + 1))
                    continue
                raise RuntimeError(f"Sin conexión con la base de datos ({e.reason})")

    def check_team(self):
        rows = self._req("GET", f"/rest/v1/team?user_id=eq.{self.user_id}&select=role")
        if not rows:
            raise RuntimeError("El usuario robot no está en el equipo del CRM (falta en team_invites).")

    def list(self, col):
        out, offset = {}, 0
        while True:
            rows = self._req("GET", f"/rest/v1/docs?collection=eq.{col}&select=id,data&order=id&limit=1000&offset={offset}")
            for r in rows:
                out[r["id"]] = r["data"] or {}
            if len(rows) < 1000:
                return out
            offset += 1000

    def upsert(self, col, docs):
        items = [{"collection": col, "id": i, "data": d, "updated_at": now_iso()} for i, d in docs.items()]
        for k in range(0, len(items), 200):
            self._req("POST", "/rest/v1/docs?on_conflict=collection,id", items[k:k + 200],
                      headers={"Prefer": "resolution=merge-duplicates,return=minimal"})

    def merge(self, col, doc_id, patch):
        self._req("POST", "/rest/v1/rpc/docs_merge", {"p_collection": col, "p_id": doc_id, "p_patch": patch})

    def delete_collection(self, col):
        self._req("DELETE", f"/rest/v1/docs?collection=eq.{col}", headers={"Prefer": "return=minimal"})


class LocalDB:
    """Base de datos simulada en un archivo JSON, para probar sin tocar el CRM real."""

    def __init__(self, path):
        self.path = Path(path)
        self.user_id = "u_hermes_robot"
        self.db = json.loads(self.path.read_text(encoding="utf-8")) if self.path.exists() else {}

    def _save(self):
        self.path.write_text(json.dumps(self.db, ensure_ascii=False, indent=1), encoding="utf-8")

    def check_team(self):
        pass

    def list(self, col):
        return {k: dict(v) for k, v in self.db.get(col, {}).items()}

    def upsert(self, col, docs):
        self.db.setdefault(col, {}).update(json.loads(json.dumps(docs)))
        self._save()

    def merge(self, col, doc_id, patch):
        if doc_id not in self.db.get(col, {}):
            raise RuntimeError(f"not_found {col}/{doc_id}")
        self.db[col][doc_id].update(json.loads(json.dumps(patch)))
        self._save()

    def delete_collection(self, col):
        self.db[col] = {}
        self._save()


# ----------------------------------------------------------------- lectura de archivos
ALIASES = {
    "nombre": "nombre", "nombre_del_negocio": "nombre", "negocio": "nombre",
    "rubro": "rubro", "provincia": "provincia", "distrito": "distrito",
    "direccion": "direccion", "telefono": "telefono", "celular": "telefono", "whatsapp": "telefono",
    "instagram": "instagram", "facebook": "facebook", "tiktok": "tiktok",
    "estado_web": "estado_web", "url_web": "url_web", "web": "url_web",
    "nota_resenas": "resenas_nota", "resenas_nota": "resenas_nota",
    "n_resenas": "resenas_cantidad", "no_resenas": "resenas_cantidad", "nro_resenas": "resenas_cantidad",
    "numero_de_resenas": "resenas_cantidad", "resenas_cantidad": "resenas_cantidad", "cantidad_resenas": "resenas_cantidad",
    "seguidores": "seguidores", "anuncios_activos": "anuncios_activos",
    "ultima_publicacion": "ultima_publicacion", "score": "score", "puntaje": "score", "prioridad": "prioridad",
    "evidencia_de_pago": "evidencia_pago", "evidencia_pago": "evidencia_pago",
    "gancho_de_venta": "gancho", "gancho": "gancho", "fuente": "fuente",
    "fecha_registro": "fecha_registro", "fecha_de_registro": "fecha_registro",
    # Vendedor
    "canal_sugerido": "canal", "canal": "canal",
    "contacto_telefono_o": "contacto", "contacto": "contacto", "contacto_telefono_o_arroba": "contacto",
    "mensaje_1": "mensaje1", "mensaje1": "mensaje1", "mensaje": "mensaje1",
    "seguimiento_dia_3": "seguimiento3", "seguimiento_3": "seguimiento3",
    "seguimiento_dia_7": "seguimiento7", "seguimiento_7": "seguimiento7",
    "dato_usado_para_personalizar": "dato", "dato_personalizacion": "dato", "dato_usado": "dato",
    "estado": "estado", "link_whatsapp": "link", "link": "link", "fecha_envio": "fecha_envio",
}


def header_key(h):
    k = re.sub(r"[^a-z0-9]+", "_", norm(h).replace("°", "")).strip("_")
    return ALIASES.get(k, k)


def read_table(path, preferred_sheet):
    """Devuelve una lista de dicts con claves canónicas (snake_case)."""
    rows = []
    if path.suffix.lower() == ".csv":
        raw = path.read_bytes()
        try:
            text = raw.decode("utf-8-sig")
        except UnicodeDecodeError:
            text = raw.decode("cp1252")
        first = text.splitlines()[0] if text else ""
        delim = max([",", ";", "\t"], key=first.count)
        rows = list(csv.reader(io.StringIO(text), delimiter=delim))
    else:
        import openpyxl
        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
        ws = next((w for w in wb.worksheets if norm(w.title) == norm(preferred_sheet)), wb.worksheets[0])
        rows = [list(r) for r in ws.iter_rows(values_only=True)]
        wb.close()
    hi = next((i for i, r in enumerate(rows[:15]) if any(header_key(c) == "nombre" for c in r if c is not None)), None)
    if hi is None:
        raise ValueError("no encontré la fila de encabezados (falta la columna Nombre)")
    keys = [header_key(c) if c is not None else "" for c in rows[hi]]
    out = []
    for r in rows[hi + 1:]:
        d = {k: clean(r[i]) if i < len(r) else "" for i, k in enumerate(keys) if k}
        if d.get("nombre"):
            out.append(d)
    return out


def file_ready(path):
    try:
        st = path.stat()
        if time.time() - st.st_mtime < STABLE_SECONDS:
            return False
        time.sleep(1)
        if path.stat().st_size != st.st_size:
            return False
        with open(path, "rb"):
            return True
    except OSError:
        return False


def pending_files(folder, state):
    if not folder.exists():
        return []
    files = []
    for p in folder.iterdir():
        n = p.name
        if not p.is_file() or p.suffix.lower() not in (".xlsx", ".csv") or n.startswith("~$") or n.upper().startswith("PRUEBA_"):
            continue
        digest = hashlib.sha1(p.read_bytes()).hexdigest()
        prev = state["procesados"].get(str(p))
        if prev and prev.get("sha1") == digest:
            continue
        files.append((p.stat().st_mtime, p, digest))
    return [(p, d) for _, p, d in sorted(files)]


# ----------------------------------------------------------------- prospectos
STAGE_RANK = {"nuevo": 0, "contactado": 1, "respondio": 2, "interesado": 3, "propuesta": 4, "ganado": 5, "perdido": 5, "descartado": 5}
VENDOR_STAGE = {"enviado": "contactado", "respondio": "respondio", "reunion": "interesado", "cliente": "ganado",
                "no interesado": "perdido", "no contactar": "descartado"}


def blank_lead():
    return {"name": "", "city": "", "category": "", "phone": "", "mapsUrl": "", "stage": "nuevo", "owner": None,
            "priority": "media", "notes": "", "nextAction": "", "nextDate": "", "service": "", "value": 0,
            "contactName": "", "email": "", "social": "", "lostReason": "", "source": "", "lastContactAt": None}


def hermes_fields(r, fname):
    score = to_number(r.get("score"))
    score = max(0, min(10, round(score))) if score is not None else None
    prio = clean(r.get("prioridad")).capitalize()
    if score is not None:
        prio = "Alta" if score >= 8 else "Media" if score >= 6 else "Baja"
    ig, fb, tt = (social_url(r.get(k), k) for k in ("instagram", "facebook", "tiktok"))
    return {
        "district": r.get("distrito", ""), "address": r.get("direccion", ""),
        "instagram": ig, "facebook": fb, "tiktok": tt,
        "webStatus": r.get("estado_web", ""), "webUrl": r.get("url_web", ""),
        "reviewsRating": r.get("resenas_nota", ""), "reviewsCount": r.get("resenas_cantidad", ""),
        "followers": r.get("seguidores", ""), "adsActive": r.get("anuncios_activos", ""),
        "lastPost": r.get("ultima_publicacion", ""), "hermesScore": score, "hermesPriority": prio or "",
        "payEvidence": r.get("evidencia_pago", ""), "hook": r.get("gancho", ""),
        "hermesSource": r.get("fuente", ""), "hermesDate": r.get("fecha_registro", ""), "hermesBatch": fname,
    }


def summary_total(path):
    """'Total guardados' from the Resumen sheet, to warn when the Prospector lost rows."""
    if path.suffix.lower() != ".xlsx":
        return None
    try:
        import openpyxl
        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
        ws = next((w for w in wb.worksheets if norm(w.title) == "resumen"), None)
        total = None
        if ws:
            for r in ws.iter_rows(values_only=True):
                if r and r[0] and norm(r[0]) == "total guardados" and len(r) > 1:
                    total = int(to_number(r[1]) or 0)
        wb.close()
        return total
    except Exception:
        return None


def import_prospects(db, path):
    rows = read_table(path, "Prospectos")
    expected = summary_total(path)
    if expected is not None and expected != len(rows):
        log(f"  · Aviso: el resumen de {path.name} dice {expected} prospectos guardados, pero la hoja trae {len(rows)} con datos. "
            "Revisa el archivo del Prospector (puede haber filas vacías).")
    batch, dupes = {}, 0
    for r in rows:
        k = key_of(r["nombre"], r.get("distrito", ""))
        if k in batch:
            dupes += 1
            if (to_number(r.get("score")) or 0) <= (to_number(batch[k].get("score")) or 0):
                continue
        batch[k] = r
    leads = db.list("leads")
    by_phone = {re.sub(r"\D", "", d.get("phone", ""))[-9:]: i for i, d in leads.items() if len(re.sub(r"\D", "", d.get("phone", ""))) >= 7}
    seq = max([d.get("seq") or 0 for d in leads.values()] + [0])
    now = now_iso()
    new_docs, updated = {}, 0
    for r in batch.values():
        hid = lead_id(r["nombre"], r.get("distrito", ""))
        hf = hermes_fields(r, path.name)
        phone, other_phones = split_phones(r.get("telefono", ""))
        hf["phoneAlt"] = other_phones
        target = hid if hid in leads else by_phone.get(re.sub(r"\D", "", phone)[-9:]) if len(re.sub(r"\D", "", phone)) >= 7 else None
        if target and target in leads:
            # only what this batch actually brings: never blank out data from an earlier batch
            patch = {k: v for k, v in hf.items() if v not in ("", None)}
            cur = leads[target]
            if not cur.get("phone") and phone:
                patch["phone"] = phone
            if not cur.get("social"):
                patch["social"] = hf["instagram"] or hf["facebook"] or hf["tiktok"]
            db.merge("leads", target, patch)
            updated += 1
            continue
        seq += 1
        doc = blank_lead()
        doc.update(hf)
        doc.update({
            "name": r["nombre"], "category": r.get("rubro", ""), "city": r.get("provincia", "") or "Lima",
            "phone": phone, "social": hf["instagram"] or hf["facebook"] or hf["tiktok"],
            "priority": {"Alta": "alta", "Media": "media", "Baja": "baja"}.get(hf["hermesPriority"], "media"),
            "source": "Hermes · Prospector", "seq": seq,
            "createdAt": now, "createdBy": db.user_id, "updatedAt": now, "updatedBy": db.user_id,
        })
        new_docs[hid] = doc
    if new_docs:
        db.upsert("leads", new_docs)
    if new_docs or updated:
        act_id = "imp-" + hashlib.sha1((path.name + now).encode()).hexdigest()[:12]
        db.upsert("activities", {act_id: {"leadId": None, "leadName": "", "type": "importacion",
                                          "text": f"{len(new_docs)} prospectos nuevos y {updated} actualizados de {path.name}",
                                          "from": None, "to": None, "by": db.user_id, "at": now}})
    return {"filas": len(rows), "nuevos": len(new_docs), "actualizados": updated, "duplicados_en_archivo": dupes}


# ----------------------------------------------------------------- mensajes del Vendedor
def import_messages(db, path):
    rows = read_table(path, "Mensajes")
    leads = db.list("leads")
    by_key = {key_of(d.get("name"), d.get("district")): i for i, d in leads.items()}
    by_name = {}
    for i, d in leads.items():
        by_name.setdefault(norm(d.get("name")), []).append(i)
    now = now_iso()
    matched, stage_moves, unmatched = 0, 0, []
    for r in rows:
        target = by_key.get(key_of(r["nombre"], r.get("distrito", "")))
        if not target:
            same = by_name.get(norm(r["nombre"]), [])
            target = same[0] if len(same) == 1 else None
        if not target:
            unmatched.append(f'{r["nombre"]} ({r.get("distrito", "") or "sin distrito"})')
            continue
        cur = leads[target]
        patch = {"vChannel": r.get("canal", ""), "vContact": r.get("contacto", ""), "vMsg1": r.get("mensaje1", ""),
                 "vFollow3": r.get("seguimiento3", ""), "vFollow7": r.get("seguimiento7", ""), "vPersonal": r.get("dato", ""),
                 "vEstado": r.get("estado", ""), "vLink": r.get("link", ""), "vFechaEnvio": r.get("fecha_envio", ""),
                 "vFile": path.name, "vUpdatedAt": now}
        to = VENDOR_STAGE.get(norm(r.get("estado", "")))
        act = None
        if to and STAGE_RANK.get(to, 0) > STAGE_RANK.get(cur.get("stage", "nuevo"), 0):
            patch.update({"stage": to, "stageAt": now})
            if to in ("perdido", "descartado"):
                patch["nextDate"] = ""
            act = {"leadId": target, "leadName": cur.get("name", ""), "type": "estado", "text": "Según el archivo del Vendedor (Hermes)",
                   "from": cur.get("stage", "nuevo"), "to": to, "by": db.user_id, "at": now}
            stage_moves += 1
        fecha = r.get("fecha_envio", "")
        if fecha and not cur.get("lastContactAt") and re.match(r"\d{4}-\d{2}-\d{2}", fecha):
            patch["lastContactAt"] = fecha[:10] + "T12:00:00.000Z"
            patch["lastContactBy"] = db.user_id
        patch["updatedAt"], patch["updatedBy"] = now, db.user_id
        db.merge("leads", target, patch)
        if act:
            db.upsert("activities", {"ven-" + hashlib.sha1((target + now).encode()).hexdigest()[:12]: act})
        matched += 1
    for u in unmatched:
        log(f"  · Sin prospecto en el CRM para el mensaje de: {u} (no se creó nada)")
    return {"filas": len(rows), "cruzados": matched, "etapas_actualizadas": stage_moves, "sin_prospecto": len(unmatched)}


# ----------------------------------------------------------------- respaldo y vaciado
def backup(db, motivo):
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    data = {col: db.list(col) for col in ("leads", "activities", "templates", "members")}
    f = BACKUP_DIR / f"{dt.datetime.now():%Y-%m-%d_%H%M%S}_{motivo}.json"
    f.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    olds = sorted(BACKUP_DIR.glob("*.json"))
    for o in olds[:-KEEP_BACKUPS]:
        if "vaciado" not in o.name:
            o.unlink()
    return f, {k: len(v) for k, v in data.items()}


def vaciar_crm(db):
    f, counts = backup(db, "antes-del-vaciado")
    log(f"Respaldo completo guardado en {f} ({counts['leads']} prospectos, {counts['activities']} registros de historial)")
    db.delete_collection("activities")
    db.delete_collection("leads")
    log(f"CRM vaciado: se borraron {counts['leads']} prospectos y {counts['activities']} registros de historial. Plantillas y equipo intactos.")


# ----------------------------------------------------------------- ejecución
def run(db):
    state = load_state()
    db.check_team()
    processed_any = False
    for folder, kind in ((PROSPECTOS_DIR, "prospectos"), (MENSAJES_DIR, "mensajes")):
        for path, digest in pending_files(folder, state):
            if not file_ready(path):
                log(f"Esperando a que termine de escribirse: {path.name}")
                continue
            if not processed_any:
                f, _ = backup(db, "antes-de-importar")
                processed_any = True
            try:
                res = import_prospects(db, path) if kind == "prospectos" else import_messages(db, path)
                state["procesados"][str(path)] = {"sha1": digest, "tipo": kind, "fecha": now_iso(), "resultado": res}
                save_state(state)
                log(f"OK {kind}: {path.name} -> " + ", ".join(f"{k.replace('_', ' ')}: {v}" for k, v in res.items()))
            except Exception as e:
                log(f"ERROR {kind}: {path.name} -> {e} (se reintentará en la próxima vuelta)")
    return processed_any


def configurar():
    alphabet = string.ascii_letters + string.digits
    pwd = "".join(secrets.choice(alphabet) for _ in range(28))
    cred_write(ROBOT_EMAIL, pwd)
    subprocess.run("clip", input=pwd.encode("utf-16-le"), check=True)
    print("Listo: se generó una clave segura para el usuario robot y quedó guardada en el")
    print("Administrador de credenciales de Windows (" + CRED_TARGET + ").")
    print("La clave también quedó COPIADA en tu portapapeles (no se muestra en pantalla).")
    print("Pégala (Ctrl+V) como contraseña al crear el usuario " + ROBOT_EMAIL + " en Supabase.")


def main():
    ap = argparse.ArgumentParser(description="Importador Hermes -> CRM de CPP")
    ap.add_argument("--simular", metavar="DB_JSON", help="usar una base local JSON en vez del CRM real")
    ap.add_argument("--configurar", action="store_true", help="generar y guardar la clave del usuario robot")
    ap.add_argument("--vaciar-crm", action="store_true", help="respaldar y borrar todos los prospectos e historial")
    ap.add_argument("--confirmo", action="store_true", help="confirmación obligatoria para --vaciar-crm")
    ap.add_argument("--estado", action="store_true", help="mostrar archivos procesados")
    a = ap.parse_args()
    if a.configurar:
        return configurar()
    if a.estado:
        for k, v in load_state()["procesados"].items():
            print(v["fecha"], v["tipo"], Path(k).name, v["resultado"])
        return
    with Lock():
        try:
            db = LocalDB(a.simular) if a.simular else Supabase()
            if a.vaciar_crm:
                if not a.confirmo:
                    raise SystemExit("Para vaciar el CRM agrega --confirmo (se hace un respaldo antes).")
                vaciar_crm(db)
                return
            run(db)
        except Exception as e:
            log(f"ERROR general: {e}")
            raise SystemExit(1)


if __name__ == "__main__":
    main()
