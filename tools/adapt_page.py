"""Turns the artifact version of the CRM into the standalone web page (index.html).

Run once after copying crm-cpp.html to index.html. Each replacement must match exactly once.
"""
import sys, pathlib

p = pathlib.Path(__file__).resolve().parent.parent / "index.html"
s = p.read_text(encoding="utf-8")

HEAD = """<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#050f17">
<link rel="icon" href="assets/icon.svg" type="image/svg+xml">
<link rel="manifest" href="manifest.webmanifest">
"""

R = [
    ('<title>CRM CPP</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n', HEAD + '<title>CRM CPP</title>\n'),
    ('</style>\n\n<div id="app"></div>', '</style>\n</head>\n<body>\n<div id="app"></div>'),
    ('<script>\n"use strict";\n/* ================= constants',
     '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js"></script>\n'
     '<script src="js/config.js"></script>\n<script src="js/backend.js"></script>\n'
     '<script>\n"use strict";\n/* ================= constants'),
    ('const LEAD_CAP=1000,', 'const LEAD_CAP=5000,'),
    ('function teamIds(){const ids=new Set(S.members.keys());',
     'function teamIds(){const ids=new Set(S.members.keys());if(S.user&&typeof S.user.teamIds==="function")S.user.teamIds().forEach(id=>ids.add(id));'),
    ('Tienes acceso de solo lectura. Pide acceso de Editor al dueño del CRM.', 'Tu usuario no tiene permiso para guardar cambios. Pide a quien administra el CRM que lo revise.'),
    ('const role=S.readOnly?"Solo lectura":S.me.isOwner?"Dueño":S.me.canEdit?"Editor":"Colaborador";',
     'const role=S.readOnly?"Solo lectura":S.me.isOwner?"Administrador · Mi perfil":"Equipo CPP · Mi perfil";'),
    ('  $("#nav").addEventListener("click",e=>{const b=e.target.closest("[data-nav]");if(b)go(b.dataset.nav)});',
     '  $("#nav").addEventListener("click",e=>{const b=e.target.closest("[data-nav]");if(b)go(b.dataset.nav)});\n'
     '  const meBox=$("#me-box");meBox.setAttribute("role","button");meBox.tabIndex=0;meBox.style.cursor="pointer";meBox.title="Mi perfil";\n'
     '  meBox.addEventListener("click",()=>{if(window.CRM_PROFILE)window.CRM_PROFILE()});meBox.addEventListener("keydown",e=>{if((e.key==="Enter"||e.key===" ")&&window.CRM_PROFILE){e.preventDefault();window.CRM_PROFILE()}});'),
    ('parts.push(["bad","Abre este CRM desde claude.ai para ver y editar los contactos del equipo."]);',
     'parts.push(["bad","No se pudo cargar la conexión con la base de datos. Revisa tu internet y recarga la página."]);'),
    ('parts.push(["bad","No se pudo abrir la base de datos del equipo. Inicia sesión en claude.ai con la cuenta a la que se compartió este CRM y vuelve a abrirlo."]);',
     'parts.push(["bad","No se pudo abrir la base de datos del equipo. Recarga la página; si sigue igual, cierra sesión y vuelve a entrar."]);'),
    ('Tienes acceso de solo lectura. Para registrar contactos y cambios, pide al dueño del CRM que te comparta el acceso como Editor.',
     'Tu usuario no tiene permiso para guardar cambios. Pide a quien administra el CRM que lo revise.'),
    ('La base llegó a 1000 contactos, el máximo que muestra el CRM.', 'La base llegó a ${LEAD_CAP} contactos, el máximo que muestra el CRM.'),
    ('toast("La base llegó a 1000 contactos. Elimina descartados antes de agregar más.","bad")',
     'toast(`La base llegó a ${LEAD_CAP} contactos. Elimina descartados antes de agregar más.`,"bad")'),
    ('"Este CRM guarda los datos en claude.ai. Ábrelo desde el enlace del artifact para trabajar con el equipo."',
     '"No se pudo cargar la conexión con la base de datos. Revisa tu internet y recarga la página."'),
    ('"Inicia sesión en claude.ai con la cuenta que tiene acceso a este CRM y vuelve a abrir el enlace."',
     '"Recarga la página. Si sigue igual, cierra sesión desde tu perfil y vuelve a entrar."'),
    ('Abre el CRM con tu cuenta de claude.ai para ver las plantillas del equipo.', 'Recarga la página para ver las plantillas del equipo.'),
    ('\nboot();\n</script>\n', '\nif(window.CRM_READY)window.CRM_READY.then(boot);else boot();\n</script>\n</body>\n</html>\n'),
]
for old, new in R:
    n = s.count(old)
    if n != 1:
        sys.exit(f"expected 1 match, found {n}: {old[:80]!r}")
    s = s.replace(old, new)

# the leadsCapped banner string uses double quotes; turn that one into a template literal
s = s.replace('parts.push(["","La base llegó a ${LEAD_CAP} contactos, el máximo que muestra el CRM. Elimina contactos descartados antes de importar más."]);',
              'parts.push(["",`La base llegó a ${LEAD_CAP} contactos, el máximo que muestra el CRM. Elimina contactos descartados antes de importar más.`]);')
p.write_text(s, encoding="utf-8")
print("ok", len(s))
