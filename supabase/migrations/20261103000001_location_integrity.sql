-- Integridad de ubicaciones (Parte 1 del plan de pendientes).
--
-- 1. Unicidad real en base: hoy solo se evita por código y con `ilike`, que
--    distingue tildes (`Fatima` y `Fátima` creaban dos barrios) y no protege
--    de dos guardados simultáneos.
-- 2. Índices trigram para la búsqueda de barrios por nombre parcial.
-- 3. RPC `merge_barrios` para fusionar duplicados moviendo los inmuebles.
--
-- Se normaliza con minúsculas + sin tildes, que es la misma regla que usa el
-- buscador semántico para detectar la zona.

-- `unaccent` es STABLE (depende del diccionario), así que no puede indexarse
-- directamente. Se envuelve en una función IMMUTABLE con el esquema fijo.
create or replace function public.normalize_nombre(valor text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
    select pg_catalog.lower(extensions.unaccent(pg_catalog.btrim(coalesce(valor, ''))));
$$;

comment on function public.normalize_nombre(text) is
    'Minúsculas y sin tildes. Se usa para comparar nombres de ubicaciones.';

-- Sin duplicados previos verificados (0 en las tres tablas), los índices
-- pueden crearse directamente.
create unique index if not exists ux_departamentos_nombre_norm
    on public.departamentos (public.normalize_nombre(nombre));

create unique index if not exists ux_ciudades_nombre_norm
    on public.ciudades (departamento_id, public.normalize_nombre(nombre));

create unique index if not exists ux_barrios_nombre_norm
    on public.barrios (ciudad_id, public.normalize_nombre(nombre));

-- Búsqueda por nombre parcial (`ilike '%texto%'`) sin escanear la tabla.
create index if not exists idx_barrios_nombre_trgm
    on public.barrios using gin (nombre extensions.gin_trgm_ops);

create index if not exists idx_ciudades_nombre_trgm
    on public.ciudades using gin (nombre extensions.gin_trgm_ops);

-- Fusionar dos barrios de la misma ciudad: mueve los inmuebles y borra el
-- sobrante. Se hace en una sola transacción para no dejar inmuebles huérfanos.
create or replace function public.merge_barrios(origen uuid, destino uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    movidos integer;
    ciudad_origen uuid;
    ciudad_destino uuid;
begin
    if not public.is_admin() then
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
$$;

comment on function public.merge_barrios(uuid, uuid) is
    'Mueve los inmuebles del barrio origen al destino y borra el origen. Devuelve cuántos movió.';

revoke all on function public.merge_barrios(uuid, uuid) from public;
revoke all on function public.merge_barrios(uuid, uuid) from anon;
grant execute on function public.merge_barrios(uuid, uuid) to authenticated;
