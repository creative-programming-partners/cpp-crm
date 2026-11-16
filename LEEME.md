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

- **Correos:** la bandeja del agente de correo (`agente/`), que redacta con la suscripción de Claude y envía desde el correo de CPP solo lo que alguien aprobó aquí. Instalación en [`agente/LEEME.md`](agente/LEEME.md).

OpenStreetMap no tiene todos los negocios ni trae reseñas: por eso las estrellas se anotan a mano después de ver el negocio en Maps.

## Importador Hermes (automático, en la PC de Darnell)
`importador/importador_hermes.py` carga en el CRM lo que dejan los agentes de Hermes Desktop. No toca nada de Hermes y solo lee sus Excel.

- **Prospector** (`Documents\CPP\prospectos\AAAA-MM-DD_rubro_distrito.xlsx`): cada fila es un contacto nuevo con origen "Hermes · Prospector", e incluye distrito, redes, web, reseñas, puntaje 0–10 y gancho. Si el negocio ya estaba (mismo nombre y distrito, o mismo teléfono), solo se completan los datos. Los lotes se acumulan.
- **Vendedor** (`Documents\CPP\mensajes\AAAA-MM-DD_mensajes.xlsx`): se busca el contacto por nombre y distrito y se le agregan los mensajes sugeridos (primer mensaje y seguimientos a 3 y 7 días). La etapa solo avanza, nunca retrocede. En la ficha aparecen en "Mensajes del Vendedor" y en Contacto rápido salen como plantillas.
- Se ignoran los archivos `PRUEBA_*` y `~$*`, los que siguen guardándose y los ya procesados (si un archivo cambia, se vuelve a procesar).
- Corre solo con la tarea **CPP CRM - Importador Hermes** del Programador de tareas, al iniciar sesión y cada 10 minutos. Para instalarla otra vez: `powershell -ExecutionPolicy Bypass -File importador\instalar_tarea.ps1`.
- Entra al CRM como el usuario robot `hermes@cppcstudio.com`. Su clave está en el Administrador de credenciales de Windows (`CPP-CRM-Hermes`) y no se escribe en ningún archivo. Para cambiarla: `python importador\importador_hermes.py --configurar`, y después pon la misma clave en Supabase → Authentication → Users.
- Registro, respaldos y estado: `Documents\CPP\crm-importador\` (`logs\importador.log`, `respaldos\`, `estado.json`). Antes de cualquier borrado o importación se guarda un respaldo JSON completo.
- Otros comandos: `--probar` (prueba la conexión), `--estado` (archivos procesados), `--simular db.json` (prueba sin tocar la base real), `--limpiar-no-trabajados --confirmo` (borra los contactos de Google Maps que nadie trabajó).

## Respaldo
Desde **Contactos → Exportar** se descarga todo en Excel. Hazlo una vez por semana y guárdalo en Drive: es la copia de seguridad más simple.
