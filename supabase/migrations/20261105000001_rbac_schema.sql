-- ============================================================
-- ADM-41 — R1: esquema RBAC (aditivo)
--
-- No cambia ninguna política ni el comportamiento del panel.
-- Añade:
--   1) admins.activo / admins.nombre
--   2) admin_roles, admin_permisos, admin_rol_permisos,
--      admin_usuarios_roles, admin_auditoria
--   3) catálogo de permisos y rol de sistema Superadmin
--   4) public.tiene_permiso(), public.is_admin() con activo,
--      public.admin_mis_permisos()
--
-- Las cinco tablas quedan con RLS activo y SIN políticas: solo
-- service_role accede. Todo pasa por RPC SECURITY DEFINER.
-- ============================================================

-- 1) Acceso al panel -------------------------------------------------

alter table public.admins
    add column if not exists activo boolean not null default true,
    add column if not exists nombre text;

comment on column public.admins.activo is
    'Falso bloquea el acceso al panel sin borrar la cuenta ni sus inmuebles.';

-- 2) Tablas ----------------------------------------------------------

create table if not exists public.admin_roles (
    id uuid primary key default gen_random_uuid(),
    nombre text not null,
    descripcion text,
    es_sistema boolean not null default false,
    creado_at timestamptz not null default now(),
    actualizado_at timestamptz not null default now()
);

create unique index if not exists ux_admin_roles_nombre_norm
    on public.admin_roles (public.normalize_nombre(nombre));

comment on table public.admin_roles is
    'Roles del panel. es_sistema = true (Superadmin) no se edita ni se borra.';

create table if not exists public.admin_permisos (
    clave text primary key,
    grupo text not null,
    descripcion text not null,
    es_sistema boolean not null default true
);

comment on table public.admin_permisos is
    'Catálogo de acciones que el código sabe comprobar. Lo siembran las migraciones.';

create table if not exists public.admin_rol_permisos (
    rol_id uuid not null references public.admin_roles(id) on delete cascade,
    permiso_clave text not null references public.admin_permisos(clave) on delete restrict,
    primary key (rol_id, permiso_clave)
);

create index if not exists idx_admin_rol_permisos_permiso
    on public.admin_rol_permisos (permiso_clave);

create table if not exists public.admin_usuarios_roles (
    user_id uuid not null references public.admins(user_id) on delete cascade,
    rol_id uuid not null references public.admin_roles(id) on delete restrict,
    primary key (user_id, rol_id)
);

create index if not exists idx_admin_usuarios_roles_rol
    on public.admin_usuarios_roles (rol_id);

create table if not exists public.admin_auditoria (
    id bigserial primary key,
    actor_id uuid references auth.users(id) on delete set null,
    accion text not null,
    entidad text not null,
    entidad_id text,
    datos jsonb not null default '{}'::jsonb,
    creado_at timestamptz not null default now()
);

create index if not exists idx_admin_auditoria_creado
    on public.admin_auditoria (creado_at desc);

-- RLS activo y sin políticas: igual que public.admins hoy.
alter table public.admin_roles enable row level security;
alter table public.admin_permisos enable row level security;
alter table public.admin_rol_permisos enable row level security;
alter table public.admin_usuarios_roles enable row level security;
alter table public.admin_auditoria enable row level security;

revoke all on table public.admin_roles from public, anon, authenticated;
revoke all on table public.admin_permisos from public, anon, authenticated;
revoke all on table public.admin_rol_permisos from public, anon, authenticated;
revoke all on table public.admin_usuarios_roles from public, anon, authenticated;
revoke all on table public.admin_auditoria from public, anon, authenticated;

grant all on table public.admin_roles to service_role;
grant all on table public.admin_permisos to service_role;
grant all on table public.admin_rol_permisos to service_role;
grant all on table public.admin_usuarios_roles to service_role;
grant all on table public.admin_auditoria to service_role;
grant usage, select on sequence public.admin_auditoria_id_seq to service_role;

-- 3) Catálogo de permisos -------------------------------------------

insert into public.admin_permisos (clave, grupo, descripcion) values
    ('inmuebles.ver.todos',      'Inmuebles',     'Ver todos los inmuebles, incluida la papelera'),
    ('inmuebles.crear',          'Inmuebles',     'Publicar inmuebles'),
    ('inmuebles.editar',         'Inmuebles',     'Editar cualquier inmueble'),
    ('inmuebles.editar.propios', 'Inmuebles',     'Editar solo los inmuebles propios'),
    ('inmuebles.eliminar',       'Inmuebles',     'Eliminar definitivamente'),
    ('inmuebles.papelera',       'Inmuebles',     'Mover a la papelera y restaurar'),
    ('inmuebles.cambiar_estado', 'Inmuebles',     'Marcar vendido, alquilado o disponible'),
    ('inmuebles.destacar',       'Inmuebles',     'Marcar y quitar destacados'),
    ('inmuebles.renovar',        'Inmuebles',     'Renovar vencimientos y cambiar la duración'),
    ('imagenes.gestionar',       'Fotos',         'Subir, reemplazar y borrar fotos'),
    ('ubicaciones.gestionar',    'Ubicaciones',   'Crear, renombrar, fusionar y borrar ubicaciones'),
    ('configuracion.ver',        'Configuración', 'Ver la configuración del negocio'),
    ('configuracion.editar',     'Configuración', 'Cambiar WhatsApp, saludo y SEO'),
    ('estadisticas.ver',         'Sistema',       'Ver estadísticas del catálogo'),
    ('embeddings.ver',           'Sistema',       'Ver el estado de los embeddings'),
    ('embeddings.reindexar',     'Sistema',       'Reindexar embeddings'),
    ('cache.ver',                'Sistema',       'Ver el estado de la caché'),
    ('cache.purgar',             'Sistema',       'Purgar la caché de búsquedas'),
    ('usuarios.ver',             'Accesos',       'Ver administradores'),
    ('usuarios.crear',           'Accesos',       'Crear administradores'),
    ('usuarios.editar',          'Accesos',       'Cambiar email y contraseña de otros'),
    ('usuarios.desactivar',      'Accesos',       'Activar y desactivar accesos'),
    ('usuarios.eliminar',        'Accesos',       'Eliminar cuentas'),
    ('roles.ver',                'Accesos',       'Ver roles y permisos'),
    ('roles.crear',              'Accesos',       'Crear roles'),
    ('roles.editar',             'Accesos',       'Renombrar roles y cambiar sus permisos'),
    ('roles.eliminar',           'Accesos',       'Borrar roles'),
    ('roles.asignar',            'Accesos',       'Asignar roles a usuarios')
on conflict (clave) do nothing;

-- 4) Rol de sistema y asignación al administrador actual ------------

insert into public.admin_roles (nombre, descripcion, es_sistema)
values ('Superadmin', 'Acceso total, incluidos los permisos futuros. No editable.', true)
on conflict do nothing;

insert into public.admin_usuarios_roles (user_id, rol_id)
select a.user_id, r.id
from public.admins a
cross join public.admin_roles r
where r.es_sistema
on conflict do nothing;

-- 5) Funciones -------------------------------------------------------

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
          and activo
    );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;

create or replace function public.tiene_permiso(clave text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.admins a
        join public.admin_usuarios_roles ur on ur.user_id = a.user_id
        join public.admin_roles r on r.id = ur.rol_id
        where a.user_id = (select auth.uid())
          and a.activo
          and (
              r.es_sistema
              or exists (
                  select 1
                  from public.admin_rol_permisos rp
                  where rp.rol_id = r.id
                    and rp.permiso_clave = clave
              )
          )
    );
$$;

revoke all on function public.tiene_permiso(text) from public, anon;
grant execute on function public.tiene_permiso(text) to authenticated, service_role;

create or replace function public.admin_mis_permisos()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
    select coalesce(
        array(
            select p.clave
            from public.admin_permisos p
            where exists (
                select 1
                from public.admins a
                join public.admin_usuarios_roles ur on ur.user_id = a.user_id
                join public.admin_roles r on r.id = ur.rol_id
                where a.user_id = (select auth.uid())
                  and a.activo
                  and (
                      r.es_sistema
                      or exists (
                          select 1
                          from public.admin_rol_permisos rp
                          where rp.rol_id = r.id
                            and rp.permiso_clave = p.clave
                      )
                  )
            )
            order by p.clave
        ),
        '{}'::text[]
    );
$$;

revoke all on function public.admin_mis_permisos() from public, anon;
grant execute on function public.admin_mis_permisos() to authenticated, service_role;

comment on function public.tiene_permiso(text) is
    'ADM-41: autorización fina. Un rol con es_sistema = true tiene todos los permisos.';
