-- Estadísticas y caché del panel (ADM-29 / ADM-28).
--
-- El panel no puede leer `semantic_search_cache` ni `storage.objects` con la
-- clave anónima, así que se exponen tres funciones `SECURITY DEFINER` que
-- comprueban `is_admin()`. Devuelven solo agregados, nunca vectores ni datos
-- personales.

create or replace function public.admin_stats()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    resultado jsonb;
begin
    if not public.is_admin() then
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
            'vencidos', (
                select count(*) from public.inmuebles
                 where deleted_at is null and estado = 'Vencido'
            ),
            'papelera', (
                select count(*) from public.inmuebles where deleted_at is not null
            ),
            'total', (select count(*) from public.inmuebles)
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
$$;

comment on function public.admin_stats() is
    'Conteos del catálogo, storage, ubicaciones y embeddings para Panel → Sistema (ADM-29).';

create or replace function public.admin_cache_stats()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    resultado jsonb;
begin
    if not public.is_admin() then
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
$$;

comment on function public.admin_cache_stats() is
    'Resumen de semantic_search_cache (filas, hits, tamaño y data_version) para ADM-28.';

create or replace function public.admin_purge_cache(solo_expiradas boolean default false)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    borradas integer;
begin
    if not public.is_admin() then
        raise exception 'Solo un administrador puede purgar la caché.'
            using errcode = '42501';
    end if;

    if coalesce(solo_expiradas, false) then
        delete from public.semantic_search_cache where results_expires_at <= now();
    else
        delete from public.semantic_search_cache;
    end if;

    get diagnostics borradas = row_count;
    return borradas;
end;
$$;

comment on function public.admin_purge_cache(boolean) is
    'Borra la caché de búsquedas; con true solo las entradas expiradas. Devuelve cuántas eliminó.';

revoke all on function public.admin_stats() from public;
revoke all on function public.admin_stats() from anon;
grant execute on function public.admin_stats() to authenticated;

revoke all on function public.admin_cache_stats() from public;
revoke all on function public.admin_cache_stats() from anon;
grant execute on function public.admin_cache_stats() to authenticated;

revoke all on function public.admin_purge_cache(boolean) from public;
revoke all on function public.admin_purge_cache(boolean) from anon;
grant execute on function public.admin_purge_cache(boolean) to authenticated;
