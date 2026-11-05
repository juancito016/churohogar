-- ============================================================
-- ADM-41 — R2: políticas RLS por permiso + trigger de columnas
--      + guards de los RPC existentes.
--
-- Sustituye las 21 políticas que usaban is_admin() por
-- tiene_permiso(...). El rol de sistema (Superadmin) pasa todas.
--
-- Rollback: .secrets/backups/2026-11-05_pre_rbac/policies.json
-- ============================================================

-- 1) Inmuebles -------------------------------------------------------

drop policy if exists "Admin Insert Inmuebles" on public.inmuebles;
create policy "Admin Insert Inmuebles"
    on public.inmuebles for insert to authenticated
    with check (
        (select public.tiene_permiso('inmuebles.crear'))
        and admin_id = (select auth.uid())
    );

drop policy if exists "Admin Update Inmuebles" on public.inmuebles;
create policy "Admin Update Inmuebles"
    on public.inmuebles for update to authenticated
    using (
        (select public.tiene_permiso('inmuebles.editar'))
        or ((select public.tiene_permiso('inmuebles.editar.propios')) and admin_id = (select auth.uid()))
    )
    with check (
        (select public.tiene_permiso('inmuebles.editar'))
        or ((select public.tiene_permiso('inmuebles.editar.propios')) and admin_id = (select auth.uid()))
    );

drop policy if exists "Admin Delete Inmuebles" on public.inmuebles;
create policy "Admin Delete Inmuebles"
    on public.inmuebles for delete to authenticated
    using ((select public.tiene_permiso('inmuebles.eliminar')));

drop policy if exists "Admin Read Inmuebles" on public.inmuebles;
create policy "Admin Read Inmuebles"
    on public.inmuebles for select to authenticated
    using (
        (select public.tiene_permiso('inmuebles.ver.todos'))
        or ((select public.tiene_permiso('inmuebles.editar.propios')) and admin_id = (select auth.uid()))
    );

-- 2) Imágenes --------------------------------------------------------
-- Gestionar fotos exige permiso y poder editar el inmueble (propio o cualquiera).

drop policy if exists "Admin Insert Imagenes" on public.imagenes;
create policy "Admin Insert Imagenes"
    on public.imagenes for insert to authenticated
    with check (
        (select public.tiene_permiso('imagenes.gestionar'))
        and exists (
            select 1 from public.inmuebles i
            where i.id = imagenes.inmueble_id
              and (
                  (select public.tiene_permiso('inmuebles.editar'))
                  or i.admin_id = (select auth.uid())
              )
        )
    );

drop policy if exists "Admin Update Imagenes" on public.imagenes;
create policy "Admin Update Imagenes"
    on public.imagenes for update to authenticated
    using (
        (select public.tiene_permiso('imagenes.gestionar'))
        and exists (
            select 1 from public.inmuebles i
            where i.id = imagenes.inmueble_id
              and (
                  (select public.tiene_permiso('inmuebles.editar'))
                  or i.admin_id = (select auth.uid())
              )
        )
    )
    with check (
        (select public.tiene_permiso('imagenes.gestionar'))
        and exists (
            select 1 from public.inmuebles i
            where i.id = imagenes.inmueble_id
              and (
                  (select public.tiene_permiso('inmuebles.editar'))
                  or i.admin_id = (select auth.uid())
              )
        )
    );

drop policy if exists "Admin Delete Imagenes" on public.imagenes;
create policy "Admin Delete Imagenes"
    on public.imagenes for delete to authenticated
    using (
        (select public.tiene_permiso('imagenes.gestionar'))
        and exists (
            select 1 from public.inmuebles i
            where i.id = imagenes.inmueble_id
              and (
                  (select public.tiene_permiso('inmuebles.editar'))
                  or i.admin_id = (select auth.uid())
              )
        )
    );

-- 3) Ubicaciones -----------------------------------------------------

drop policy if exists "Admin Insert Barrios" on public.barrios;
create policy "Admin Insert Barrios"
    on public.barrios for insert to authenticated
    with check ((select public.tiene_permiso('ubicaciones.gestionar')));

drop policy if exists "Admin Update Barrios" on public.barrios;
create policy "Admin Update Barrios"
    on public.barrios for update to authenticated
    using ((select public.tiene_permiso('ubicaciones.gestionar')))
    with check ((select public.tiene_permiso('ubicaciones.gestionar')));

drop policy if exists "Admin Delete Barrios" on public.barrios;
create policy "Admin Delete Barrios"
    on public.barrios for delete to authenticated
    using ((select public.tiene_permiso('ubicaciones.gestionar')));

drop policy if exists "Admin Insert Ciudades" on public.ciudades;
create policy "Admin Insert Ciudades"
    on public.ciudades for insert to authenticated
    with check ((select public.tiene_permiso('ubicaciones.gestionar')));

drop policy if exists "Admin Update Ciudades" on public.ciudades;
create policy "Admin Update Ciudades"
    on public.ciudades for update to authenticated
    using ((select public.tiene_permiso('ubicaciones.gestionar')))
    with check ((select public.tiene_permiso('ubicaciones.gestionar')));

drop policy if exists "Admin Delete Ciudades" on public.ciudades;
create policy "Admin Delete Ciudades"
    on public.ciudades for delete to authenticated
    using ((select public.tiene_permiso('ubicaciones.gestionar')));

drop policy if exists "Admin Insert Departamentos" on public.departamentos;
create policy "Admin Insert Departamentos"
    on public.departamentos for insert to authenticated
    with check ((select public.tiene_permiso('ubicaciones.gestionar')));

drop policy if exists "Admin Update Departamentos" on public.departamentos;
create policy "Admin Update Departamentos"
    on public.departamentos for update to authenticated
    using ((select public.tiene_permiso('ubicaciones.gestionar')))
    with check ((select public.tiene_permiso('ubicaciones.gestionar')));

drop policy if exists "Admin Delete Departamentos" on public.departamentos;
create policy "Admin Delete Departamentos"
    on public.departamentos for delete to authenticated
    using ((select public.tiene_permiso('ubicaciones.gestionar')));

-- 4) Configuración del negocio ---------------------------------------

drop policy if exists "Admin Insert Configuracion" on public.configuracion_negocio;
create policy "Admin Insert Configuracion"
    on public.configuracion_negocio for insert to authenticated
    with check ((select public.tiene_permiso('configuracion.editar')));

drop policy if exists "Admin Update Configuracion" on public.configuracion_negocio;
create policy "Admin Update Configuracion"
    on public.configuracion_negocio for update to authenticated
    using ((select public.tiene_permiso('configuracion.editar')))
    with check ((select public.tiene_permiso('configuracion.editar')));

-- 5) Storage (bucket fotos-inmuebles) --------------------------------

drop policy if exists "Admin insert fotos-inmuebles" on storage.objects;
create policy "Admin insert fotos-inmuebles"
    on storage.objects for insert to authenticated
    with check (
        bucket_id = 'fotos-inmuebles'
        and (select public.tiene_permiso('imagenes.gestionar'))
    );

drop policy if exists "Admin update fotos-inmuebles" on storage.objects;
create policy "Admin update fotos-inmuebles"
    on storage.objects for update to authenticated
    using (
        bucket_id = 'fotos-inmuebles'
        and (select public.tiene_permiso('imagenes.gestionar'))
    )
    with check (
        bucket_id = 'fotos-inmuebles'
        and (select public.tiene_permiso('imagenes.gestionar'))
    );

drop policy if exists "Admin delete fotos-inmuebles" on storage.objects;
create policy "Admin delete fotos-inmuebles"
    on storage.objects for delete to authenticated
    using (
        bucket_id = 'fotos-inmuebles'
        and (select public.tiene_permiso('imagenes.gestionar'))
    );

-- 6) Columnas sensibles de inmuebles ---------------------------------
--
-- RLS no distingue columnas: sin esto, quien tenga "editar" podría
-- cambiar estado, destacado, papelera o vencimiento por API.
-- Se permite lo justo para que los flujos actuales sigan funcionando:
--   - reactivar/restaurar/revivir también toca publicado_at/expira_at
--   - renovar un vencido también toca estado

create or replace function public.enforce_inmueble_column_permissions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    -- service_role, cron y SQL directo no pasan por aquí.
    if (select auth.uid()) is null then
        return new;
    end if;

    if coalesce((select auth.role()), '') = 'service_role' then
        return new;
    end if;

    if new.destacado is distinct from old.destacado
       and not public.tiene_permiso('inmuebles.destacar') then
        raise exception 'Sin permiso para destacar inmuebles.'
            using errcode = '42501';
    end if;

    if new.deleted_at is distinct from old.deleted_at
       and not public.tiene_permiso('inmuebles.papelera') then
        raise exception 'Sin permiso para mover o restaurar de la papelera.'
            using errcode = '42501';
    end if;

    if new.estado is distinct from old.estado
       and not public.tiene_permiso('inmuebles.cambiar_estado')
       and not (
           old.estado = 'Vencido'
           and new.estado = 'Disponible'
           and public.tiene_permiso('inmuebles.renovar')
       ) then
        raise exception 'Sin permiso para cambiar el estado del inmueble.'
            using errcode = '42501';
    end if;

    if (new.publicado_at is distinct from old.publicado_at
        or new.expira_at is distinct from old.expira_at)
       and not public.tiene_permiso('inmuebles.renovar')
       and not public.tiene_permiso('inmuebles.cambiar_estado')
       and not public.tiene_permiso('inmuebles.papelera') then
        raise exception 'Sin permiso para renovar o cambiar la vigencia.'
            using errcode = '42501';
    end if;

    return new;
end;
$$;

revoke all on function public.enforce_inmueble_column_permissions() from public, anon, authenticated;

drop trigger if exists trg_enforce_inmueble_column_permissions on public.inmuebles;
create trigger trg_enforce_inmueble_column_permissions
    before update on public.inmuebles
    for each row
    execute function public.enforce_inmueble_column_permissions();

-- 7) Guards de los RPC existentes ------------------------------------

-- merge_barrios -> ubicaciones.gestionar
CREATE OR REPLACE FUNCTION public.merge_barrios(origen uuid, destino uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
    movidos integer;
    ciudad_origen uuid;
    ciudad_destino uuid;
begin
    if not public.tiene_permiso('ubicaciones.gestionar') then
        raise exception 'Solo un administrador puede fusionar barrios.'
            using errcode = '42501';
    end if;

    if origen is null or destino is null then
        raise exception 'Debes indicar el barrio de origen y el de destino.'
            using errcode = '22023';
    end if;

    if origen = destino then
        raise exception 'El barrio de origen y el de destino son el mismo.'
            using errcode = '22023';
    end if;

    select ciudad_id into ciudad_origen from public.barrios where id = origen;
    select ciudad_id into ciudad_destino from public.barrios where id = destino;

    if ciudad_origen is null then
        raise exception 'El barrio de origen no existe.' using errcode = '22023';
    end if;

    if ciudad_destino is null then
        raise exception 'El barrio de destino no existe.' using errcode = '22023';
    end if;

    if ciudad_origen <> ciudad_destino then
        raise exception 'Los dos barrios deben pertenecer a la misma ciudad.'
            using errcode = '22023';
    end if;

    update public.inmuebles
       set barrio_id = destino
     where barrio_id = origen;

    get diagnostics movidos = row_count;

    delete from public.barrios where id = origen;

    return movidos;
end;
$function$
;

-- admin_stats -> estadisticas.ver
CREATE OR REPLACE FUNCTION public.admin_stats()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
    resultado jsonb;
begin
    if not public.tiene_permiso('estadisticas.ver') then
        raise exception 'Solo un administrador puede ver las estadísticas.'
            using errcode = '42501';
    end if;

    select jsonb_build_object(
        'inmuebles', jsonb_build_object(
            'activos', (
                select count(*) from public.inmuebles
                 where deleted_at is null
                   and estado = 'Disponible'
                   and (expira_at is null or expira_at > now())
            ),
            'vendidos', (
                select count(*) from public.inmuebles
                 where deleted_at is null and estado = 'Vendido'
            ),
            'alquilados', (
                select count(*) from public.inmuebles
                 where deleted_at is null and estado = 'Alquilado'
            ),
            'vencidos', (
                select count(*) from public.inmuebles
                 where deleted_at is null and estado = 'Vencido'
            ),
            'papelera', (
                select count(*) from public.inmuebles where deleted_at is not null
            ),
            'total', (select count(*) from public.inmuebles)
        ),
        'operacion', jsonb_build_object(
            'venta', (
                select count(*) from public.inmuebles
                 where deleted_at is null and operacion = 'Venta'
            ),
            'alquiler', (
                select count(*) from public.inmuebles
                 where deleted_at is null and operacion = 'Alquiler'
            )
        ),
        'imagenes', (select count(*) from public.imagenes),
        'storage', jsonb_build_object(
            'archivos', (
                select count(*) from storage.objects
                 where bucket_id = 'fotos-inmuebles' and archived_at is null
            ),
            'bytes', coalesce((
                select sum((metadata ->> 'size')::bigint) from storage.objects
                 where bucket_id = 'fotos-inmuebles' and archived_at is null
            ), 0)
        ),
        'ubicaciones', jsonb_build_object(
            'departamentos', (select count(*) from public.departamentos),
            'ciudades', (select count(*) from public.ciudades),
            'barrios', (select count(*) from public.barrios)
        ),
        'embeddings', jsonb_build_object(
            'conVector', (select count(distinct inmueble_id) from public.inmueble_embeddings),
            'total', (select count(*) from public.inmuebles where deleted_at is null)
        )
    ) into resultado;

    return resultado;
end;
$function$
;

-- admin_cache_stats -> cache.ver
CREATE OR REPLACE FUNCTION public.admin_cache_stats()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
    resultado jsonb;
begin
    if not public.tiene_permiso('cache.ver') then
        raise exception 'Solo un administrador puede ver el estado de la caché.'
            using errcode = '42501';
    end if;

    select jsonb_build_object(
        'total', count(*),
        'vigentes', count(*) filter (where results_expires_at > now()),
        'expiradas', count(*) filter (where results_expires_at <= now()),
        'hits', coalesce(sum(hits), 0),
        'consultasConHit', count(*) filter (where hits > 0),
        'bytesAproximados', coalesce(sum(octet_length(result_payload::text)), 0),
        'ultimaConsulta', max(last_hit_at),
        'ultimaCreacion', max(created_at),
        'dataVersion', (select data_version from public.search_cache_meta where id),
        'metaActualizadoAt', (select updated_at from public.search_cache_meta where id)
    ) into resultado
    from public.semantic_search_cache;

    return resultado;
end;
$function$
;

-- admin_purge_cache -> cache.purgar
CREATE OR REPLACE FUNCTION public.admin_purge_cache(solo_expiradas boolean DEFAULT false)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
    borradas integer;
begin
    if not public.tiene_permiso('cache.purgar') then
        raise exception 'Solo un administrador puede purgar la caché.'
            using errcode = '42501';
    end if;

    if coalesce(solo_expiradas, false) then
        delete from public.semantic_search_cache where results_expires_at <= now();
    else
        delete from public.semantic_search_cache where true;
    end if;

    get diagnostics borradas = row_count;
    return borradas;
end;
$function$
;

-- renew_publications -> inmuebles.renovar
CREATE OR REPLACE FUNCTION public.renew_publications(target_ids uuid[], dias integer DEFAULT 30)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
    afectados integer;
begin
    if not public.tiene_permiso('inmuebles.renovar') then
        raise exception 'Solo un administrador puede renovar publicaciones.'
            using errcode = '42501';
    end if;

    if target_ids is null or array_length(target_ids, 1) is null then
        raise exception 'Debes indicar al menos un inmueble.' using errcode = '22023';
    end if;

    if dias is not null and (dias < 1 or dias > 3650) then
        raise exception 'La duraciÃ³n debe estar entre 1 y 3650 dÃ­as.' using errcode = '22023';
    end if;

    update public.inmuebles i
       set estado = 'Disponible',
           publicado_at = now(),
           expira_at = case
               when dias is null then null
               when i.expira_at is null or i.expira_at <= now() then
                   (
                       date_trunc('day', now() at time zone 'America/La_Paz')
                       + make_interval(days => dias - 1)
                       + interval '23:59:59.999'
                   ) at time zone 'America/La_Paz'
               else
                   i.expira_at + make_interval(days => dias)
           end
     where i.id = any(target_ids)
       and i.deleted_at is null
       and i.estado in ('Disponible', 'Vencido');

    get diagnostics afectados = row_count;
    return afectados;
end;
$function$
;

