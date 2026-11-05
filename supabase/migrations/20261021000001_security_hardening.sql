-- ============================================================
-- Endurecimiento de seguridad
-- Fecha: 2026-10-21
-- Objetivo:
--   1. Crear una lista explícita de administradores.
--   2. Reemplazar políticas que permitían escribir a cualquier
--      usuario autenticado.
--   3. Restringir storage al administrador.
--   4. Corregir el trigger de borrado de imágenes legacy.
--
-- Requiere que 20261021000000_reconcile_drift.sql se haya aplicado
-- antes (crea idx_imagenes_inmueble y normaliza departamentos).
--
-- Aplicar con `supabase db push` o el runner de migraciones.
-- No insertar manualmente en supabase_migrations.schema_migrations.
-- ============================================================

-- 1) Administradores explícitos.
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;
revoke all on table public.admins from public, anon, authenticated;
grant all on table public.admins to service_role;

insert into public.admins (user_id)
select '2ee5e1cf-6de3-4692-b6e4-99498cf01abe'::uuid
where exists (
  select 1 from auth.users
  where id = '2ee5e1cf-6de3-4692-b6e4-99498cf01abe'::uuid
)
on conflict (user_id) do nothing;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admins
    where user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;

-- 2) Inmuebles: escritura solo para administradores.
drop policy if exists "Admin Insert Inmuebles" on public.inmuebles;
drop policy if exists "Admin Update Inmuebles" on public.inmuebles;
drop policy if exists "Admin Delete Inmuebles" on public.inmuebles;

create policy "Admin Insert Inmuebles"
  on public.inmuebles for insert
  to authenticated
  with check (public.is_admin() and admin_id = (select auth.uid()));

create policy "Admin Update Inmuebles"
  on public.inmuebles for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "Admin Delete Inmuebles"
  on public.inmuebles for delete
  to authenticated
  using (public.is_admin());

-- 3) Imágenes: escritura solo para administradores.
drop policy if exists "Auth Insert Imagenes" on public.imagenes;
drop policy if exists "Auth Update Imagenes" on public.imagenes;
drop policy if exists "Auth Delete Imagenes" on public.imagenes;
drop policy if exists "Admin Insert Imagenes" on public.imagenes;
drop policy if exists "Admin Update Imagenes" on public.imagenes;
drop policy if exists "Admin Delete Imagenes" on public.imagenes;

create policy "Admin Insert Imagenes"
  on public.imagenes for insert
  to authenticated
  with check (public.is_admin());

create policy "Admin Update Imagenes"
  on public.imagenes for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "Admin Delete Imagenes"
  on public.imagenes for delete
  to authenticated
  using (public.is_admin());

-- 4) Ubicaciones: escritura solo para administradores.
drop policy if exists "Auth Insert Barrios" on public.barrios;
drop policy if exists "Auth Update Barrios" on public.barrios;
drop policy if exists "Auth Delete Barrios" on public.barrios;
drop policy if exists "Admin Insert Barrios" on public.barrios;
drop policy if exists "Admin Update Barrios" on public.barrios;
drop policy if exists "Admin Delete Barrios" on public.barrios;

create policy "Admin Insert Barrios"
  on public.barrios for insert
  to authenticated
  with check (public.is_admin());

create policy "Admin Update Barrios"
  on public.barrios for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "Admin Delete Barrios"
  on public.barrios for delete
  to authenticated
  using (public.is_admin());

drop policy if exists "Auth Insert Ciudades" on public.ciudades;
drop policy if exists "Auth Update Ciudades" on public.ciudades;
drop policy if exists "Auth Delete Ciudades" on public.ciudades;
drop policy if exists "Admin Insert Ciudades" on public.ciudades;
drop policy if exists "Admin Update Ciudades" on public.ciudades;
drop policy if exists "Admin Delete Ciudades" on public.ciudades;

create policy "Admin Insert Ciudades"
  on public.ciudades for insert
  to authenticated
  with check (public.is_admin());

create policy "Admin Update Ciudades"
  on public.ciudades for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "Admin Delete Ciudades"
  on public.ciudades for delete
  to authenticated
  using (public.is_admin());

drop policy if exists "Auth Insert Departamentos" on public.departamentos;
drop policy if exists "Auth Update Departamentos" on public.departamentos;
drop policy if exists "Auth Delete Departamentos" on public.departamentos;
drop policy if exists "Admin Insert Departamentos" on public.departamentos;
drop policy if exists "Admin Update Departamentos" on public.departamentos;
drop policy if exists "Admin Delete Departamentos" on public.departamentos;

create policy "Admin Insert Departamentos"
  on public.departamentos for insert
  to authenticated
  with check (public.is_admin());

create policy "Admin Update Departamentos"
  on public.departamentos for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "Admin Delete Departamentos"
  on public.departamentos for delete
  to authenticated
  using (public.is_admin());

-- 5) Storage: lectura pública del bucket, escritura solo admin.
--    Solo se eliminan políticas del bucket fotos-inmuebles; las de
--    otros buckets se conservan.
do $$
declare
  policy_names text[];
  policy_name text;
begin
  select array_agg(policyname::text)
  into policy_names
  from pg_policies
  where schemaname = 'storage'
    and tablename = 'objects'
    and (
      policyname::text ilike '%fotos%'
      or policyname::text ilike '%fotd%'
      or policyname::text ilike '%imágenes%'
      or policyname::text ilike '%imagenes%'
      or policyname::text ilike '%1h8l7rm%'
      or coalesce(qual, '') ilike '%fotos-inmuebles%'
      or coalesce(with_check, '') ilike '%fotos-inmuebles%'
    );

  if policy_names is not null then
    foreach policy_name in array policy_names loop
      execute format('drop policy if exists %I on storage.objects', policy_name);
    end loop;
  end if;
end $$;

create policy "Public read fotos-inmuebles"
  on storage.objects for select
  to public
  using (bucket_id = 'fotos-inmuebles');

create policy "Admin insert fotos-inmuebles"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'fotos-inmuebles' and public.is_admin());

create policy "Admin update fotos-inmuebles"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'fotos-inmuebles' and public.is_admin())
  with check (bucket_id = 'fotos-inmuebles' and public.is_admin());

create policy "Admin delete fotos-inmuebles"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'fotos-inmuebles' and public.is_admin());

-- 5.1) Límites del bucket: 5 MB y solo imágenes.
update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'fotos-inmuebles';

-- 6) Trigger de borrado de imágenes compatible con URL y path.
create or replace function public.delete_storage_object()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  object_name text;
begin
  object_name := regexp_replace(
    regexp_replace(OLD.url_storage, '^.*/fotos-inmuebles/', ''),
    '\?.*$',
    ''
  );

  delete from storage.objects
  where bucket_id = 'fotos-inmuebles'
    and name = object_name;

  return OLD;
exception when others then
  raise notice 'No se pudo borrar el archivo físico: %', OLD.url_storage;
  return OLD;
end;
$$;

revoke all on function public.delete_storage_object() from public, anon, authenticated;

-- 7) Normalizar URLs legacy antes de que el trigger las procese.
update public.imagenes
set url_storage = regexp_replace(url_storage, '^.*/fotos-inmuebles/', '')
where url_storage like 'http%';

-- 8) Índices de FKs y listados.
create index if not exists idx_inmuebles_barrio_id
  on public.inmuebles (barrio_id);
create index if not exists idx_inmuebles_admin_id
  on public.inmuebles (admin_id);
create index if not exists idx_inmuebles_estado_creado_at
  on public.inmuebles (estado, creado_at desc);
create index if not exists idx_barrios_ciudad_id
  on public.barrios (ciudad_id);
create index if not exists idx_ciudades_departamento_id
  on public.ciudades (departamento_id);

-- 9) El historial de migraciones lo registra el runner de Supabase.
--    No insertar filas a mano en supabase_migrations.schema_migrations.
