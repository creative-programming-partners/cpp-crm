-- CRM CPP · Paso 1: estructura de la base de datos
-- Pega TODO este archivo en Supabase → SQL Editor → New query, y presiona Run.
-- Se puede volver a ejecutar sin problema (no borra datos).

-- ============================================================
-- Lista de personas que pueden entrar al CRM
-- ============================================================
create table if not exists public.team_invites (
  email text primary key,
  name  text not null default '',
  role  text not null default 'member' check (role in ('admin', 'member'))
);
alter table public.team_invites enable row level security;  -- solo se edita desde el SQL Editor

-- >>> EDITA AQUÍ: los correos del equipo (los mismos con los que crearás sus usuarios) <<<
insert into public.team_invites (email, name, role) values
  ('darnvll@gmail.com',        'Darnell',      'admin'),
  ('CORREO_DE_JOSE@gmail.com', 'José Santana', 'member'),
  ('CORREO_DE_JUAN@gmail.com', 'Juan Flores',  'member')
on conflict (email) do update set name = excluded.name, role = excluded.role;

-- ============================================================
-- Miembros del equipo (se llena solo cuando se crea un usuario invitado)
-- ============================================================
create table if not exists public.team (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  email      text,
  name       text not null default '',
  color      text,
  role       text not null default 'member' check (role in ('admin', 'member')),
  created_at timestamptz not null default now()
);
alter table public.team enable row level security;

create or replace function public.is_team()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.team where user_id = auth.uid());
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare inv record;
begin
  select * into inv from public.team_invites where lower(email) = lower(new.email);
  if found then
    insert into public.team (user_id, email, name, role)
    values (new.id, new.email, coalesce(nullif(inv.name, ''), split_part(new.email, '@', 1)), inv.role)
    on conflict (user_id) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Por si ya creaste usuarios antes de correr este archivo
insert into public.team (user_id, email, name, role)
select u.id, u.email, coalesce(nullif(i.name, ''), split_part(u.email, '@', 1)), i.role
from auth.users u join public.team_invites i on lower(i.email) = lower(u.email)
on conflict (user_id) do nothing;

drop policy if exists "equipo ve al equipo" on public.team;
create policy "equipo ve al equipo" on public.team for select to authenticated using (public.is_team());
drop policy if exists "cada uno edita su perfil" on public.team;
create policy "cada uno edita su perfil" on public.team for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Nadie puede cambiarse el rol a sí mismo desde la página
create or replace function public.keep_role()
returns trigger language plpgsql as $$
begin
  if current_user = 'authenticated' then
    new.role := old.role; new.user_id := old.user_id; new.email := old.email;
  end if;
  return new;
end $$;
drop trigger if exists team_keep_role on public.team;
create trigger team_keep_role before update on public.team for each row execute function public.keep_role();

-- ============================================================
-- Datos del CRM: contactos, historial, plantillas, etc.
-- ============================================================
create table if not exists public.docs (
  collection text not null,
  id         text not null,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (collection, id)
);
create index if not exists docs_collection_updated on public.docs (collection, updated_at desc);
alter table public.docs enable row level security;
alter table public.docs replica identity full;

drop policy if exists "equipo lee" on public.docs;
create policy "equipo lee" on public.docs for select to authenticated using (public.is_team());
drop policy if exists "equipo crea" on public.docs;
create policy "equipo crea" on public.docs for insert to authenticated with check (public.is_team());
drop policy if exists "equipo edita" on public.docs;
create policy "equipo edita" on public.docs for update to authenticated using (public.is_team()) with check (public.is_team());
drop policy if exists "equipo borra" on public.docs;
create policy "equipo borra" on public.docs for delete to authenticated using (public.is_team());

-- Cambia solo los campos enviados, sin pisar lo que otro compañero editó al mismo tiempo
create or replace function public.docs_merge(p_collection text, p_id text, p_patch jsonb)
returns void language plpgsql security invoker set search_path = public as $$
begin
  update public.docs set data = data || p_patch, updated_at = now()
  where collection = p_collection and id = p_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
end $$;
revoke all on function public.docs_merge(text, text, jsonb) from public, anon;
grant execute on function public.docs_merge(text, text, jsonb) to authenticated;

-- Permisos de la página (las reglas de arriba deciden qué filas ve cada uno)
revoke all on public.docs, public.team, public.team_invites from anon;
grant select, insert, update, delete on public.docs to authenticated;
grant select, update on public.team to authenticated;
revoke all on public.team_invites from authenticated;
grant execute on function public.is_team() to authenticated;

-- Cambios en vivo para todo el equipo
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'docs') then
    alter publication supabase_realtime add table public.docs;
  end if;
end $$;
