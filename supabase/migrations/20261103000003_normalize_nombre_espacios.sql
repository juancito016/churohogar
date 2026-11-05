-- `normalize_nombre` también colapsa espacios internos.
--
-- La detección de zona del buscador (`normalizeText`) convierte cualquier
-- secuencia de espacios en uno solo antes de comparar. Si la base no hace lo
-- mismo, `'San  Blas'` y `'San Blas'` quedarían como dos barrios distintos y
-- el buscador solo reconocería uno. Se alinean las dos reglas.

create or replace function public.normalize_nombre(valor text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
    select pg_catalog.lower(
        extensions.unaccent(
            pg_catalog.btrim(
                pg_catalog.regexp_replace(coalesce(valor, ''), '\s+', ' ', 'g')
            )
        )
    );
$$;

comment on function public.normalize_nombre(text) is
    'Minúsculas, sin tildes y con los espacios normalizados. Se usa para comparar nombres de ubicaciones.';

drop index if exists public.ux_departamentos_nombre_norm;
drop index if exists public.ux_ciudades_nombre_norm;
drop index if exists public.ux_barrios_nombre_norm;

create unique index ux_departamentos_nombre_norm
    on public.departamentos (public.normalize_nombre(nombre));

create unique index ux_ciudades_nombre_norm
    on public.ciudades (departamento_id, public.normalize_nombre(nombre));

create unique index ux_barrios_nombre_norm
    on public.barrios (ciudad_id, public.normalize_nombre(nombre));
