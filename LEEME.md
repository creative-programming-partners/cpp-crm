# CRM CPP

CRM web del equipo de CPP para prospectar negocios sin página web: contactos, pipeline, seguimientos, plantillas de WhatsApp y trabajo en vivo (se ve quién contactó a quién y quién está atendiendo cada ficha).

- **Página:** `index.html` (sin compilación; se publica tal cual en Vercel).
- **Base de datos, login y tiempo real:** Supabase (plan gratuito).
- **Conexión:** `js/backend.js`. **Configuración:** `js/config.js`.

## Puesta en marcha (una sola vez)

### 1. Crear el proyecto en Supabase
1. Entra a <https://supabase.com>, crea una cuenta y un proyecto nuevo (`cpp-crm`, región **South America (São Paulo)**).
2. En **Project Settings → API** copia la **Project URL** y la clave **anon public**.
3. Pégalas en `js/config.js`. La clave `service_role` **nunca** va en la página.

### 2. Crear la base de datos
1. Abre `supabase/1-estructura.sql` y escribe los correos reales del equipo en el bloque marcado con `EDITA AQUÍ`.
2. En Supabase → **SQL Editor → New query**, pega el archivo completo y presiona **Run**.
3. Haz lo mismo con `supabase/2-contactos.sql` (carga los 467 contactos y las 5 plantillas). Al final muestra cuántos registros quedaron.

### 3. Crear los usuarios del equipo
1. En Supabase → **Authentication → Users → Add user → Create new user**.
2. Escribe el correo (el mismo que pusiste en la lista) y una contraseña, y marca **Auto Confirm User**.
3. Repite para cada persona. Cada uno puede cambiar su contraseña y su nombre desde **Mi perfil** en el CRM.
4. Recomendado: en **Authentication → Sign In / Providers**, desactiva **Allow new users to sign up**. Aunque alguien se registrara por su cuenta, no podría ver nada porque no está en la lista del equipo.

### 4. Publicar
Se publica en Vercel como sitio estático (sin build). Cada cambio en los archivos se vuelve a publicar.

## Agregar a alguien más al equipo después
1. En el SQL Editor:
   ```sql
   insert into public.team_invites (email, name, role) values ('correo@ejemplo.com', 'Nombre', 'member');
   ```
2. Crea su usuario en **Authentication → Users** con ese mismo correo.

Para quitar a alguien, borra su usuario en **Authentication → Users**.

## Olvidó su contraseña
En **Authentication → Users**, abre el usuario y elige **Send password recovery** o asígnale una nueva.

## Probar cambios sin tocar la base real
```bash
python tools/build_test.py
python -m http.server 8766
```
Abre `http://localhost:8766/test.html` e inicia sesión con `darnell@test.com` / `test1234` (base simulada en `tools/mock-supabase.js`; nada se guarda de verdad). `test.html` no se publica.

## Respaldo
Desde **Contactos → Exportar** se descarga todo en Excel. Hazlo una vez por semana y guárdalo en Drive: es la copia de seguridad más simple.
