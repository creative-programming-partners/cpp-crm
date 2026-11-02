"""WhatsApp message templates for the CRM. Generates supabase/3-plantillas.sql (replaces the team's templates).

Variables filled in by the CRM: {negocio} {rubro} {ciudad} {contacto} {mi_nombre}
{idea}    -> what a website can do for that type of business (see IDEAS in index.html)
{ejemplo} -> the closest real CPP project (Hotel Bahía de Cuba, Pachanka Restaurant, Alma de Poeta)
Prices and projects come from cppcstudio.com; do not add claims that are not there.
"""
import pathlib

WEB = "https://cppcstudio.com"
PROY = WEB + "/#proyectos"

TEMPLATES = [
    ("tpl-01", "Primer contacto", f"""Hola, ¿qué tal? Soy {{mi_nombre}}, de CPP. Encontré {{negocio}} en Google Maps y vi que todavía no tiene página web.

Hacemos páginas web para negocios de {{ciudad}}. Para un negocio como el suyo, la web puede {{idea}}.

✅ Aparece cuando lo buscan en Google
✅ WhatsApp, ubicación y horarios en un solo lugar
✅ Se ve bien en celular y computadora
✅ Desde S/ 300

Aquí puede ver nuestro trabajo: {PROY}
Por ejemplo, {{ejemplo}}.

¿Le gustaría que le muestre una idea de cómo se vería la página de {{negocio}}? Es sin compromiso."""),

    ("tpl-02", "Envío de ejemplos y precios", f"""¡Gracias por responder! Le cuento un poco más:

🌐 Nuestra web: {WEB}
📂 Proyectos reales: {PROY}
Por ejemplo, {{ejemplo}}.

Para {{negocio}} podríamos hacer:
• Landing page (una página con todo lo importante): desde S/ 300
• Página web con varias secciones: desde S/ 500
• Catálogo digital de productos o servicios: desde S/ 500

La idea es que su web pueda {{idea}}.

¿Qué le gustaría que muestre su página? Con eso le preparo una propuesta a medida, sin compromiso."""),

    ("tpl-03", "Seguimiento sin respuesta", f"""Hola, ¿cómo le va? Soy {{mi_nombre}}, de CPP. Hace unos días le escribí sobre una página web para {{negocio}}.

Le dejo nuestro trabajo por si quiere verlo con calma: {PROY}

Hoy mucha gente busca en Google antes de llamar o visitar un negocio. Con su propia web, a {{negocio}} lo encuentran más fácil y le escriben directo por WhatsApp.

Si le interesa, le preparo una propuesta sin compromiso. ¿Le parece?"""),

    ("tpl-04", "Envío de propuesta", f"""Hola {{contacto}}, le comparto la propuesta para la página web de {{negocio}}. Incluye lo que conversamos, el precio y lo que necesitaríamos de su parte.

Mientras la revisa, aquí puede ver otros trabajos nuestros: {PROY}

Quedo atento a sus comentarios. Si prefiere, coordinamos una llamada corta para revisarla juntos."""),

    ("tpl-05", "Guion de llamada (teléfono fijo)", f"""Buenos días, ¿hablo con {{negocio}}? Mi nombre es {{mi_nombre}}, de CPP. Hacemos páginas web y sistemas para negocios de {{ciudad}}.

Le llamo porque encontramos su negocio en Google Maps y vimos que todavía no tiene página web. Para un negocio como el suyo, la web puede {{idea}}.

¿Con quién podría conversar sobre eso?

Si muestra interés: pedir un WhatsApp o correo para enviarle ejemplos ({PROY}) y una propuesta. Precios desde S/ 300."""),

    ("tpl-06", "Último mensaje (cierre amable)", f"""Hola, le escribe {{mi_nombre}} de CPP. Este es mi último mensaje sobre la página web para {{negocio}}, para no incomodarle.

Si más adelante le interesa, aquí puede ver nuestro trabajo y escribirnos cuando quiera: {WEB}

¡Muchos éxitos con {{negocio}}!"""),
]


def e(x):
    return "E'" + x.replace("\\", "\\\\").replace("'", "\\'").replace("\r", "").replace("\n", "\\n") + "'"


rows = ",\n".join(f"('{i}',{e(n)},{o},{e(b)})" for o, (i, n, b) in enumerate(TEMPLATES, 1))
sql = f"""-- CRM CPP · Paso 3: plantillas de WhatsApp (reemplaza las del equipo por estas versiones)
insert into public.docs (collection, id, data)
select 'templates', t.id, jsonb_build_object('name', t.name, 'order', t.ord, 'body', t.body, 'updatedAt', now()::text, 'updatedBy', null)
from (values
{rows}
) as t(id, name, ord, body)
on conflict (collection, id) do update set data = excluded.data, updated_at = now();

select id, data->>'name' as nombre, length(data->>'body') as largo from public.docs where collection = 'templates' order by data->>'order';
"""
out = pathlib.Path(__file__).resolve().parent.parent / "supabase" / "3-plantillas.sql"
out.write_text(sql, encoding="utf-8")
print("ok", len(TEMPLATES), len(sql))
