# Agente de correo de CPP (estilo Harvey)

Programa que corre en una computadora del equipo y escribe y envía los correos de
prospección desde el correo de CPP. Los textos los redacta **Claude con la
suscripción del equipo** (Claude Code, sin clave de API ni cobro por uso), como
hace [Harvey](https://github.com/ethanplusai/harvey).

**Nada se envía sin aprobación.** El agente deja los borradores en el CRM, en
**Harvey → Correos**. Ahí se leen, se corrigen y se aprueban; el agente envía solo
los aprobados, dentro del horario y sin pasar el límite diario.

## Qué hace en cada ciclo (cada 10 minutos)
1. **Lee las respuestas** que llegaron al correo de CPP de negocios a los que les escribimos.
   Mueve el contacto a *Respondió* o *Interesado* y deja una contestación por aprobar.
   Si piden no recibir más correos, el contacto pasa a *No interesado* y no se le vuelve a escribir.
2. **Envía lo aprobado**, de lunes a sábado de 9:00 a 18:00 (hora de Lima), como máximo 15 al día.
   El contacto pasa a *Contactado*, queda en el historial y se agenda el seguimiento.
3. **Escribe seguimientos** en el mismo hilo para los que no respondieron en 5 días.
4. **Escribe el primer correo** para los contactos *Por contactar* que tienen correo, empezando por prioridad alta.
5. **Busca el correo** en la página web de los contactos que tienen web anotada y todavía no tienen correo.

Los correos en frío llevan **«PUBLICIDAD:»** al inicio del asunto, la firma de CPP y una forma
simple de darse de baja, como pide la Ley 28493.

## Instalación (una sola vez)
1. **Python 3.11 o más nuevo** y **Claude Code** con sesión iniciada en la cuenta Pro del equipo
   (`claude` en una terminal debe abrir sin pedir clave).
2. **Contraseña de aplicación de Google** para el correo de CPP:
   - Activa la verificación en 2 pasos de esa cuenta.
   - Entra a <https://myaccount.google.com/apppasswords>, crea una llamada «CRM CPP» y copia las 16 letras.
   - En Gmail → Configuración → *Reenvío y correo POP/IMAP*, activa **IMAP** (para leer respuestas).
   - Si es Google Workspace y no aparece la opción, el administrador debe permitir contraseñas de aplicación.
3. Copia `agente/.env.example` como `agente/.env` y complétalo:
   - `CRM_EMAIL` y `CRM_PASSWORD`: tu usuario del CRM (los envíos quedan a tu nombre en el historial).
   - `CORREO_CPP` y `CORREO_CLAVE_APP`: el correo de CPP y la contraseña de aplicación.
   - `NOMBRE_REMITENTE`: quien firma.
   Ese archivo no se sube a GitHub. **No pegues estas claves en ningún chat.**
4. Prueba las conexiones (no escribe ni envía nada):
   ```bash
   python agente/harvey_cpp.py --revisar
   ```

## Encenderlo
Doble clic en `agente/iniciar.bat`, o:
```bash
python agente/harvey_cpp.py
```
Mientras la ventana esté abierta, el agente trabaja. En el CRM, **Harvey → Correos** muestra si
está encendido, cuántos envió hoy y cuántas redacciones de Claude lleva.

Otras formas:
- `--una-vez`: un solo ciclo y termina.
- `--simular`: un ciclo que no escribe en el CRM ni envía (sí consulta a Claude).

## De dónde salen los correos
Hoy casi ningún contacto tiene correo. Se consiguen así:
- Anotándolo en la ficha del contacto (campo *Correo*).
- Importando el Excel de Mailerfind (correos de Instagram) desde **Contactos → Importar**.
- Con Harvey → Buscar negocios: algunos negocios de OpenStreetMap traen correo o web.
- El agente los busca solo en la web del negocio, si la tiene anotada.

## Ritmo y cuidados
Un correo nuevo que envía mucho de golpe cae en spam. Empieza con `LIMITE_DIARIO=15` durante las
primeras semanas y súbelo de a poco. Las redacciones de Claude se limitan a 60 al día
(`LLAMADAS_CLAUDE_POR_DIA`) para dejar espacio al resto del trabajo con Claude.
