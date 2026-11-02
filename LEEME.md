# CRM CPP

CRM web del equipo de CPP para prospectar negocios sin página web: contactos, pipeline, seguimientos, plantillas de WhatsApp y trabajo en vivo (se ve quién contactó a quién y quién está atendiendo cada ficha).

- **Dirección:** <https://cpp-crm-iota.vercel.app>
- **Página:** `index.html` (sin compilación; se publica tal cual en Vercel, equipo **CPP**, proyecto `cpp-crm`).
- **Base de datos, login y tiempo real:** Supabase, proyecto `cpp-crm` (organización Jhos, plan gratuito).
- **Conexión:** `js/backend.js`. **Configuración:** `js/config.js`.

## Cómo está armado (ya hecho)
1. Proyecto de Supabase creado; `js/config.js` tiene su Project URL y la clave pública **anon** (la `service_role` nunca va en la página).
2. En el SQL Editor se ejecutaron `supabase/1-estructura.sql` (tablas, reglas de seguridad, tiempo real) y `supabase/2-contactos.sql` (467 contactos y 5 plantillas). Ambos se pueden volver a ejecutar sin duplicar nada.
3. En **Authentication → URL Configuration**: Site URL `https://cpp-crm-iota.vercel.app` y redirecciones `https://cpp-crm-iota.vercel.app/**` y `https://cpp-crm-cpp12.vercel.app/**`.
4. En **Authentication → Sign In / Providers**: **Allow new users to sign up** desactivado. Solo entran personas invitadas.

## Agregar a alguien al equipo
1. En Supabase → **SQL Editor**, autoriza su correo:
   ```sql
   insert into public.team_invites (email, name, role) values ('correo@ejemplo.com', 'Nombre Apellido', 'member');
   ```
2. En **Authentication → Users → Add user → Send invitation**, escribe el mismo correo.
3. Le llega un correo; al abrir el enlace, el CRM le pide crear su contraseña y entra.

El correo de invitación de Supabase (plan gratuito) puede tardar unos minutos y a veces cae en spam. Hay un límite de pocos correos por hora.

Para quitar a alguien, borra su usuario en **Authentication → Users**.

## Olvidó su contraseña
En la pantalla de inicio del CRM, **Olvidé mi contraseña** envía un enlace para crear una nueva.

## Publicar cambios
```bash
npx vercel@latest deploy --prod --yes --scope cpp12
```
Los archivos de `tools/`, `supabase/`, `test.html` y `LEEME.md` no se publican (ver `.vercelignore`).

## Probar cambios sin tocar la base real
```bash
python tools/build_test.py
python -m http.server 8766
```
Abre `http://localhost:8766/test.html` e inicia sesión con `darnell@test.com` / `test1234` (base simulada en `tools/mock-supabase.js`; nada se guarda de verdad).

## Respaldo
Desde **Contactos → Exportar** se descarga todo en Excel. Hazlo una vez por semana y guárdalo en Drive: es la copia de seguridad más simple.
