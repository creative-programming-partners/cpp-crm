-- CRM CPP · Paso 4: plantilla "Respuesta a mensaje automático" (solo la agrega; no toca las demás)
insert into public.docs (collection, id, data)
select 'templates', t.id, jsonb_build_object('name', t.name, 'order', t.ord, 'body', t.body, 'updatedAt', now()::text, 'updatedBy', null)
from (values
('tpl-07',E'Respuesta a mensaje automático',1.5,E'¡Hola! Soy {mi_nombre}, de CPP 😊\n\nNo escribo como {cliente}: tengo una propuesta para {negocio}. Hacemos páginas web para {tipo}, y la suya podría {idea}.\n\n¿Me podrían comunicar con {encargado}? Le preparo sin compromiso una idea de cómo se vería su página.')
) as t(id, name, ord, body)
on conflict (collection, id) do nothing;

select id, data->>'name' as nombre, data->>'order' as orden from public.docs where collection = 'templates' order by (data->>'order')::numeric;
