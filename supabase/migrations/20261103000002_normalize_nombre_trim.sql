-- Corrección de `normalize_nombre`: recortar espacios.
--
-- La prueba de unicidad de la Parte 1 encontró que `'  sAn BlAs  '` se colaba
-- porque la función normalizaba mayúsculas y tildes pero no los extremos.
-- Con `btrim`, `'  sAn BlAs  '` y `'San Blas'` comparten la misma clave y el
-- índice único los bloquea.
--
-- Al cambiar el cuerpo de una función usada en un índice hay que reconstruir
-- el índice para que use la definición nueva.

create or replace function public.normalize_nombre(valor text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
    select pg_catalog.lower(
        extensions.unaccent(pg_catalog.btrim(coalesce(valor, '')))
    );
$$;

comment on function public.normalize_nombre(text) is
    'Minúsculas, sin tildes y sin espacios en los extremos. Se usa para comparar nombres de ubicaciones.';

drop index if exists public.ux_departamentos_nombre_norm;
drop index if exists public.ux_ciudades_nombre_norm;
drop index if exists public.ux_barrios_nombre_norm;

create unique index ux_departamentos_nombre_norm
    on public.departamentos (public.normalize_nombre(nombre));

create unique index ux_ciudades_nombre_norm
    on public.ciudades (departamento_id, public.normalize_nombre(nombre));

create unique index ux_barrios_nombre_norm
    on public.barrios (ciudad_id, public.normalize_nombre(nombre));
