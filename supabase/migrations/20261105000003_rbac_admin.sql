-- ============================================================
-- ADM-41 — R3: RPC de gestión de accesos + auditoría
--
-- Todas SECURITY DEFINER con search_path = ''.
-- Solo usuarios autenticados con el permiso correspondiente.
-- El rol de sistema (Superadmin) pasa todas las comprobaciones.
--
-- Salvaguardas:
--   - El rol de sistema no se edita ni se borra.
--   - Nadie cambia sus propios roles ni se desactiva.
--   - Siempre queda al menos un superadmin activo.
--   - No se borra un rol con usuarios asignados.
-- ============================================================

-- Helper interno: registrar auditoría -------------------------------

create or replace function public.admin_auditar(
    p_accion text,
    p_entidad text,
    p_entidad_id text,
    p_datos jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
    insert into public.admin_auditoria (actor_id, accion, entidad, entidad_id, datos)
    values ((select auth.uid()), p_accion, p_entidad, p_entidad_id, coalesce(p_datos, '{}'::jsonb));
$$;

revoke all on function public.admin_auditar(text, text, text, jsonb) from public, anon, authenticated;

-- Helper interno: exigir permiso -----------------------------------

create or replace function public.admin_exige_permiso(p_clave text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if not public.tiene_permiso(p_clave) then
        raise exception 'No tienes permiso para esta acción (%).', p_clave
            using errcode = '42501';
    end if;
end;
$$;

revoke all on function public.admin_exige_permiso(text) from public, anon, authenticated;

-- Listados ----------------------------------------------------------

create or replace function public.admin_usuarios_list()
returns table (
    user_id uuid,
    email text,
    nombre text,
    activo boolean,
    roles jsonb,
    inmuebles bigint,
    ultimo_acceso timestamptz,
    creado_at timestamptz,
    es_yo boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    perform public.admin_exige_permiso('usuarios.ver');

    return query
    select
        a.user_id,
        u.email::text,
        a.nombre,
        a.activo,
        coalesce(
            (
                select jsonb_agg(
                    jsonb_build_object(
                        'id', r.id,
                        'nombre', r.nombre,
                        'esSistema', r.es_sistema
                    )
                    order by r.es_sistema desc, r.nombre
                )
                from public.admin_usuarios_roles ur
                join public.admin_roles r on r.id = ur.rol_id
                where ur.user_id = a.user_id
            ),
            '[]'::jsonb
        ),
        (
            select count(*)
            from public.inmuebles i
            where i.admin_id = a.user_id
              and i.deleted_at is null
        ),
        u.last_sign_in_at,
        a.created_at,
        a.user_id = (select auth.uid())
    from public.admins a
    join auth.users u on u.id = a.user_id
    order by a.activo desc, coalesce(a.nombre, u.email);
end;
$$;

revoke all on function public.admin_usuarios_list() from public, anon;
grant execute on function public.admin_usuarios_list() to authenticated, service_role;

create or replace function public.admin_roles_list()
returns table (
    id uuid,
    nombre text,
    descripcion text,
    es_sistema boolean,
    permisos text[],
    usuarios bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    perform public.admin_exige_permiso('roles.ver');

    return query
    select
        r.id,
        r.nombre,
        r.descripcion,
        r.es_sistema,
        coalesce(
            (
                select array_agg(rp.permiso_clave order by rp.permiso_clave)
                from public.admin_rol_permisos rp
                where rp.rol_id = r.id
            ),
            case when r.es_sistema
                 then (select array_agg(p.clave order by p.clave) from public.admin_permisos p)
                 else '{}'::text[]
            end
        ),
        (select count(*) from public.admin_usuarios_roles ur where ur.rol_id = r.id)
    from public.admin_roles r
    order by r.es_sistema desc, r.nombre;
end;
$$;

revoke all on function public.admin_roles_list() from public, anon;
grant execute on function public.admin_roles_list() to authenticated, service_role;

create or replace function public.admin_permisos_list()
returns table (
    clave text,
    grupo text,
    descripcion text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    perform public.admin_exige_permiso('roles.ver');

    return query
    select p.clave, p.grupo, p.descripcion
    from public.admin_permisos p
    order by p.grupo, p.clave;
end;
$$;

revoke all on function public.admin_permisos_list() from public, anon;
grant execute on function public.admin_permisos_list() to authenticated, service_role;

-- Roles: crear / editar / borrar ------------------------------------

create or replace function public.admin_role_create(
    p_nombre text,
    p_descripcion text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_nombre text;
    v_id uuid;
begin
    perform public.admin_exige_permiso('roles.crear');

    v_nombre := btrim(coalesce(p_nombre, ''));
    if length(v_nombre) < 3 then
        raise exception 'El nombre del rol debe tener al menos 3 caracteres.'
            using errcode = '22023';
    end if;

    insert into public.admin_roles (nombre, descripcion)
    values (v_nombre, nullif(btrim(coalesce(p_descripcion, '')), ''))
    returning id into v_id;

    perform public.admin_auditar(
        'crear_rol', 'admin_roles', v_id::text,
        jsonb_build_object('nombre', v_nombre)
    );

    return v_id;
end;
$$;

revoke all on function public.admin_role_create(text, text) from public, anon;
grant execute on function public.admin_role_create(text, text) to authenticated, service_role;

create or replace function public.admin_role_update(
    p_role uuid,
    p_nombre text,
    p_descripcion text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_nombre text;
    v_sistema boolean;
begin
    perform public.admin_exige_permiso('roles.editar');

    select es_sistema into v_sistema from public.admin_roles where id = p_role;
    if v_sistema is null then
        raise exception 'El rol no existe.' using errcode = '22023';
    end if;
    if v_sistema then
        raise exception 'El rol de sistema no se puede editar.' using errcode = '42501';
    end if;

    v_nombre := btrim(coalesce(p_nombre, ''));
    if length(v_nombre) < 3 then
        raise exception 'El nombre del rol debe tener al menos 3 caracteres.'
            using errcode = '22023';
    end if;

    update public.admin_roles
    set nombre = v_nombre,
        descripcion = nullif(btrim(coalesce(p_descripcion, '')), ''),
        actualizado_at = now()
    where id = p_role;

    perform public.admin_auditar(
        'editar_rol', 'admin_roles', p_role::text,
        jsonb_build_object('nombre', v_nombre)
    );
end;
$$;

revoke all on function public.admin_role_update(uuid, text, text) from public, anon;
grant execute on function public.admin_role_update(uuid, text, text) to authenticated, service_role;

create or replace function public.admin_role_delete(p_role uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_sistema boolean;
    v_usuarios bigint;
    v_nombre text;
begin
    perform public.admin_exige_permiso('roles.eliminar');

    select es_sistema, nombre into v_sistema, v_nombre
    from public.admin_roles where id = p_role;

    if v_sistema is null then
        raise exception 'El rol no existe.' using errcode = '22023';
    end if;
    if v_sistema then
        raise exception 'El rol de sistema no se puede borrar.' using errcode = '42501';
    end if;

    select count(*) into v_usuarios
    from public.admin_usuarios_roles
    where rol_id = p_role;

    if v_usuarios > 0 then
        raise exception 'El rol tiene % usuario(s). Reasígnalos antes de borrarlo.', v_usuarios
            using errcode = '22023';
    end if;

    delete from public.admin_roles where id = p_role;

    perform public.admin_auditar(
        'borrar_rol', 'admin_roles', p_role::text,
        jsonb_build_object('nombre', v_nombre)
    );
end;
$$;

revoke all on function public.admin_role_delete(uuid) from public, anon;
grant execute on function public.admin_role_delete(uuid) to authenticated, service_role;

-- Permisos de un rol -------------------------------------------------

create or replace function public.admin_set_role_permissions(
    p_role uuid,
    p_permisos text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_sistema boolean;
    v_nombre text;
    v_antes text[];
    v_despues text[];
begin
    perform public.admin_exige_permiso('roles.editar');

    select es_sistema, nombre into v_sistema, v_nombre
    from public.admin_roles where id = p_role;

    if v_sistema is null then
        raise exception 'El rol no existe.' using errcode = '22023';
    end if;
    if v_sistema then
        raise exception 'Los permisos del rol de sistema no se editan.' using errcode = '42501';
    end if;

    if exists (
        select 1
        from unnest(coalesce(p_permisos, '{}'::text[])) k
        where not exists (select 1 from public.admin_permisos p where p.clave = k)
    ) then
        raise exception 'Hay permisos que no existen en el catálogo.' using errcode = '22023';
    end if;

    select coalesce(array_agg(rp.permiso_clave order by rp.permiso_clave), '{}'::text[])
    into v_antes
    from public.admin_rol_permisos rp
    where rp.rol_id = p_role;

    delete from public.admin_rol_permisos where rol_id = p_role;

    insert into public.admin_rol_permisos (rol_id, permiso_clave)
    select p_role, k from unnest(coalesce(p_permisos, '{}'::text[])) k
    on conflict do nothing;

    select coalesce(array_agg(rp.permiso_clave order by rp.permiso_clave), '{}'::text[])
    into v_despues
    from public.admin_rol_permisos rp
    where rp.rol_id = p_role;

    perform public.admin_auditar(
        'editar_permisos_rol', 'admin_roles', p_role::text,
        jsonb_build_object('rol', v_nombre, 'antes', to_jsonb(v_antes), 'despues', to_jsonb(v_despues))
    );
end;
$$;

revoke all on function public.admin_set_role_permissions(uuid, text[]) from public, anon;
grant execute on function public.admin_set_role_permissions(uuid, text[]) to authenticated, service_role;

-- Roles de un usuario ------------------------------------------------

create or replace function public.admin_set_user_roles(
    p_user uuid,
    p_roles uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_antes uuid[];
    v_despues uuid[];
    v_quedan integer;
begin
    perform public.admin_exige_permiso('roles.asignar');

    if p_user = (select auth.uid()) then
        raise exception 'No puedes cambiar tus propios roles.' using errcode = '42501';
    end if;

    if not exists (select 1 from public.admins where user_id = p_user) then
        raise exception 'El usuario no es administrador.' using errcode = '22023';
    end if;

    if exists (
        select 1
        from unnest(coalesce(p_roles, '{}'::uuid[])) k
        where not exists (select 1 from public.admin_roles r where r.id = k)
    ) then
        raise exception 'Hay roles que no existen.' using errcode = '22023';
    end if;

    select coalesce(array_agg(ur.rol_id), '{}'::uuid[])
    into v_antes
    from public.admin_usuarios_roles ur
    where ur.user_id = p_user;

    delete from public.admin_usuarios_roles where user_id = p_user;

    insert into public.admin_usuarios_roles (user_id, rol_id)
    select p_user, k from unnest(coalesce(p_roles, '{}'::uuid[])) k
    on conflict do nothing;

    -- Si el cambio deja el sistema sin superadmin activo, se aborta.
    select count(*) into v_quedan
    from public.admins a
    join public.admin_usuarios_roles ur on ur.user_id = a.user_id
    join public.admin_roles r on r.id = ur.rol_id
    where a.activo and r.es_sistema;

    if v_quedan = 0 then
        raise exception 'Debe quedar al menos un Superadmin activo.' using errcode = '22023';
    end if;

    select coalesce(array_agg(ur.rol_id order by ur.rol_id), '{}'::uuid[])
    into v_despues
    from public.admin_usuarios_roles ur
    where ur.user_id = p_user;

    perform public.admin_auditar(
        'cambiar_roles_usuario', 'admins', p_user::text,
        jsonb_build_object('antes', to_jsonb(v_antes), 'despues', to_jsonb(v_despues))
    );
end;
$$;

revoke all on function public.admin_set_user_roles(uuid, uuid[]) from public, anon;
grant execute on function public.admin_set_user_roles(uuid, uuid[]) to authenticated, service_role;

-- Activar / desactivar usuario ---------------------------------------

create or replace function public.admin_user_set_active(
    p_user uuid,
    p_activo boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_email text;
    v_quedan integer;
begin
    perform public.admin_exige_permiso('usuarios.desactivar');

    if p_user = (select auth.uid()) then
        raise exception 'No puedes desactivar tu propia cuenta.' using errcode = '42501';
    end if;

    select email into v_email from auth.users where id = p_user;
    if v_email is null then
        raise exception 'El usuario no existe.' using errcode = '22023';
    end if;

    update public.admins set activo = p_activo where user_id = p_user;

    select count(*) into v_quedan
    from public.admins a
    join public.admin_usuarios_roles ur on ur.user_id = a.user_id
    join public.admin_roles r on r.id = ur.rol_id
    where a.activo and r.es_sistema;

    if v_quedan = 0 then
        raise exception 'Debe quedar al menos un Superadmin activo.' using errcode = '22023';
    end if;

    perform public.admin_auditar(
        case when p_activo then 'activar_usuario' else 'desactivar_usuario' end,
        'admins', p_user::text,
        jsonb_build_object('email', v_email)
    );
end;
$$;

revoke all on function public.admin_user_set_active(uuid, boolean) from public, anon;
grant execute on function public.admin_user_set_active(uuid, boolean) to authenticated, service_role;

-- Auditoría ----------------------------------------------------------

create or replace function public.admin_auditoria_list(p_limit integer default 50)
returns table (
    id bigint,
    actor_email text,
    accion text,
    entidad text,
    entidad_id text,
    datos jsonb,
    creado_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    perform public.admin_exige_permiso('usuarios.ver');

    return query
    select
        au.id,
        u.email::text,
        au.accion,
        au.entidad,
        au.entidad_id,
        au.datos,
        au.creado_at
    from public.admin_auditoria au
    left join auth.users u on u.id = au.actor_id
    order by au.creado_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 200));
end;
$$;

revoke all on function public.admin_auditoria_list(integer) from public, anon;
grant execute on function public.admin_auditoria_list(integer) to authenticated, service_role;

-- Guard de usuarios.eliminar en la Edge Function --------------------
-- La Edge Function comprueba el permiso y las salvaguardas antes de
-- borrar la cuenta; este helper devuelve los inmuebles que quedarían
-- sin dueño si se borra el usuario.

create or replace function public.admin_user_delete_check(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_inmuebles bigint;
    v_superadmins integer;
    v_email text;
begin
    perform public.admin_exige_permiso('usuarios.eliminar');

    if p_user = (select auth.uid()) then
        raise exception 'No puedes eliminar tu propia cuenta.' using errcode = '42501';
    end if;

    select email into v_email from auth.users where id = p_user;
    if v_email is null then
        raise exception 'El usuario no existe.' using errcode = '22023';
    end if;

    select count(*) into v_inmuebles
    from public.inmuebles
    where admin_id = p_user and deleted_at is null;

    select count(*) into v_superadmins
    from public.admins a
    join public.admin_usuarios_roles ur on ur.user_id = a.user_id
    join public.admin_roles r on r.id = ur.rol_id
    where a.activo and r.es_sistema and a.user_id <> p_user;

    return jsonb_build_object(
        'email', v_email,
        'inmuebles', v_inmuebles,
        'otrosSuperadmins', v_superadmins
    );
end;
$$;

revoke all on function public.admin_user_delete_check(uuid) from public, anon;
grant execute on function public.admin_user_delete_check(uuid) to authenticated, service_role;
