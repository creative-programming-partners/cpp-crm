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
El código está en el repositorio privado <https://github.com/creative-programming-partners/cpp-crm>.
Cada vez que se sube un cambio a la rama `main`, GitHub Actions (`.github/workflows/publicar.yml`) lo publica solo en Vercel. Se puede ver en la pestaña **Actions** del repositorio.

- Usa el secreto `VERCEL_TOKEN` del repositorio (clave de Vercel `github-cpp-crm`, equipo CPP). Si la clave vence, crea otra en Vercel → Account Settings → Tokens y guárdala con `gh secret set VERCEL_TOKEN --repo creative-programming-partners/cpp-crm`.
- Vercel no conecta el repositorio directamente porque, en el plan gratuito, no acepta repositorios privados de una organización; por eso se usa GitHub Actions.
- Publicación manual de emergencia: `npx vercel@latest deploy --prod --yes --scope cpp12`.

Los archivos de `tools/`, `supabase/`, `.github/`, `test.html` y `LEEME.md` no se publican (ver `.vercelignore`).

## Probar cambios sin tocar la base real
```bash
python tools/build_test.py
python -m http.server 8766
```
Abre `http://localhost:8766/test.html` e inicia sesión con `darnell@test.com` / `test1234` (base simulada en `tools/mock-supabase.js`; nada se guarda de verdad).

## Harvey (sección aparte)
`js/harvey.js` agrega la sección **Harvey** al menú, con ideas del agente de ventas de código abierto [Harvey](https://github.com/ethanplusai/harvey). No cambia nada del resto del CRM: guarda en sus propias colecciones (`hv_candidates` y `hv_config`, dentro de la misma tabla `docs`) y solo crea contactos cuando alguien pulsa **Pasar al CRM**.

- **Hoy:** cuántos faltan contactar y cuántos ya se contactaron, en qué etapa está cada contactado, quién contacta y cómo va cada ciudad. Arriba, lo que toca ahora, siempre en el mismo orden: responder a los que contestaron, seguimientos vencidos, negocios de potencial alto sin contactar, candidatos por revisar y buscar más.
- **Buscar negocios:** busca por rubro y distrito en OpenStreetMap (gratis, sin cuenta), marca los que ya están en el CRM y guarda los nuevos como candidatos.
- **Candidatos:** se anotan las estrellas y las reseñas de Google Maps y el puntaje (0–100) se recalcula con sus razones. Los buenos pasan al CRM como contacto nuevo, con prioridad y notas; los demás se descartan y no vuelven a aparecer.
- **Cliente ideal:** estrellas mínimas, rango de reseñas y rubros prioritarios, compartidos por todo el equipo. Incluye la plantilla con el caso de éxito del Hotel Bahía de Cuba, que se puede agregar a Plantillas con un botón.

OpenStreetMap no tiene todos los negocios ni trae reseñas: por eso las estrellas se anotan a mano después de ver el negocio en Maps.

## Respaldo
Desde **Contactos → Exportar** se descarga todo en Excel. Hazlo una vez por semana y guárdalo en Drive: es la copia de seguridad más simple.
