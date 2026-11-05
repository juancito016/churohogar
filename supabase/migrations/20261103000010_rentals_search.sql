-- Búsqueda por operación y moneda (D19-D23).
--
-- Se actualiza el vector de texto, las tres funciones de búsqueda y las
-- estadísticas del panel. `match_inmuebles` cambia de firma, así que se borra
-- la versión anterior antes de recrearla (un `create or replace` con
-- parámetros nuevos dejaría dos sobrecargas ambiguas).

-- 1. El texto de búsqueda incluye la operación.
create or replace function public.inmuebles_search_vector_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  location_text text;
begin
  select concat_ws(' ', b.nombre, c.nombre, d.nombre)
    into location_text
  from public.barrios b
  left join public.ciudades c on c.id = b.ciudad_id
  left join public.departamentos d on d.id = c.departamento_id
  where b.id = new.barrio_id;

  new.search_vector :=
    setweight(to_tsvector('spanish'::regconfig, extensions.unaccent(coalesce(new.titulo, ''))), 'A') ||
    setweight(to_tsvector('spanish'::regconfig, extensions.unaccent(coalesce(new.descripcion, ''))), 'B') ||
    setweight(to_tsvector('spanish'::regconfig, extensions.unaccent(coalesce(location_text, ''))), 'C') ||
    setweight(to_tsvector('spanish'::regconfig, extensions.unaccent(coalesce(new.tipo_propiedad::text, ''))), 'D') ||
    setweight(to_tsvector('spanish'::regconfig, extensions.unaccent(coalesce(new.operacion::text, ''))), 'D');

  return new;
end;
$$;

-- Recalcular los vectores existentes (el trigger BEFORE UPDATE los reescribe).
update public.inmuebles set updated_at = updated_at where true;

-- 2. match_inmuebles: operación y moneda como filtros duros.
drop function if exists public.match_inmuebles(
    extensions.vector,
    text,
    integer,
    text,
    public.tipo_propiedad_enum,
    numeric,
    numeric,
    uuid,
    uuid,
    uuid,
    public.estado_inmueble_enum
);

create function public.match_inmuebles(
    query_embedding extensions.vector default null,
    query_text text default '',
    match_limit integer default 12,
    model_name text default 'gemini-embedding-2',
    filter_tipo public.tipo_propiedad_enum default null,
    filter_precio_min numeric default null,
    filter_precio_max numeric default null,
    filter_departamento_id uuid default null,
    filter_ciudad_id uuid default null,
    filter_barrio_id uuid default null,
    filter_estado public.estado_inmueble_enum default 'Disponible',
    filter_operacion public.operacion_enum default null,
    filter_moneda public.moneda_enum default null
)
returns table(
    id uuid,
    titulo text,
    descripcion text,
    tipo_propiedad public.tipo_propiedad_enum,
    operacion public.operacion_enum,
    precio numeric,
    moneda public.moneda_enum,
    superficie_terreno numeric,
    superficie_construida numeric,
    habitaciones integer,
    banos integer,
    servicios jsonb,
    estado public.estado_inmueble_enum,
    barrio_id uuid,
    barrio_nombre text,
    ciudad_nombre text,
    departamento_nombre text,
    imagen_path text,
    slug text,
    similarity double precision,
    text_rank real
)
language sql
stable
security definer
set search_path = ''
as $$
  with params as (
    select websearch_to_tsquery(
      'spanish'::regconfig,
      extensions.unaccent(coalesce(query_text, ''))
    ) as ts_query
  ),
  scored as (
    select
      i.id,
      i.titulo,
      i.descripcion,
      i.tipo_propiedad,
      i.operacion,
      i.precio,
      i.moneda,
      i.superficie_terreno,
      i.superficie_construida,
      i.habitaciones,
      i.banos,
      i.servicios,
      i.estado,
      i.barrio_id,
      b.nombre as barrio_nombre,
      c.nombre as ciudad_nombre,
      d.nombre as departamento_nombre,
      (
        select img.url_storage
        from public.imagenes img
        where img.inmueble_id = i.id
        order by img.orden, img.id
        limit 1
      ) as imagen_path,
      i.slug,
      case
        when query_embedding is null or e.embedding is null then 0::double precision
        else 1 - (e.embedding operator(extensions.<=>) query_embedding)
      end as similarity,
      case
        when p.ts_query is null then 0::real
        else ts_rank_cd(i.search_vector, p.ts_query)
      end as text_rank
    from public.inmuebles i
    left join public.inmueble_embeddings e
      on e.inmueble_id = i.id and e.model = model_name
    left join public.barrios b on b.id = i.barrio_id
    left join public.ciudades c on c.id = b.ciudad_id
    left join public.departamentos d on d.id = c.departamento_id
    cross join params p
    where (filter_estado is null or i.estado = filter_estado)
      and (filter_tipo is null or i.tipo_propiedad = filter_tipo)
      and (filter_operacion is null or i.operacion = filter_operacion)
      and (filter_moneda is null or i.moneda = filter_moneda)
      and (filter_precio_min is null or i.precio >= filter_precio_min)
      and (filter_precio_max is null or i.precio <= filter_precio_max)
      and (filter_departamento_id is null or d.id = filter_departamento_id)
      and (filter_ciudad_id is null or c.id = filter_ciudad_id)
      and (filter_barrio_id is null or i.barrio_id = filter_barrio_id)
      and i.deleted_at is null
  )
  select
    id, titulo, descripcion, tipo_propiedad, operacion, precio, moneda,
    superficie_terreno, superficie_construida, habitaciones, banos,
    servicios, estado, barrio_id, barrio_nombre, ciudad_nombre,
    departamento_nombre, imagen_path, slug, similarity, text_rank
  from scored
  order by (similarity * 0.75 + text_rank * 0.25) desc, similarity desc, precio asc
  limit least(greatest(coalesce(match_limit, 12), 1), 50);
$$;

revoke all on function public.match_inmuebles(
    extensions.vector, text, integer, text, public.tipo_propiedad_enum,
    numeric, numeric, uuid, uuid, uuid, public.estado_inmueble_enum,
    public.operacion_enum, public.moneda_enum
) from public, anon, authenticated;
grant execute on function public.match_inmuebles(
    extensions.vector, text, integer, text, public.tipo_propiedad_enum,
    numeric, numeric, uuid, uuid, uuid, public.estado_inmueble_enum,
    public.operacion_enum, public.moneda_enum
) to service_role;

-- 3. Similares/cercanas: nunca mezclar venta con alquiler y comparar precio
--    solo dentro de la misma moneda.
drop function if exists public.match_nearby_inmuebles(uuid, integer);

create function public.match_nearby_inmuebles(target_id uuid, match_limit integer default 3)
returns table(
    id uuid,
    titulo text,
    precio numeric,
    moneda public.moneda_enum,
    tipo_propiedad public.tipo_propiedad_enum,
    operacion public.operacion_enum,
    barrio_nombre text,
    ciudad_nombre text,
    departamento_nombre text,
    imagen_path text,
    slug text
)
language sql
stable
set search_path = ''
as $$
  with target as (
    select
      i.id,
      i.barrio_id,
      b.ciudad_id,
      c.departamento_id,
      i.tipo_propiedad,
      i.operacion,
      i.precio,
      i.moneda
    from public.inmuebles i
    left join public.barrios b on b.id = i.barrio_id
    left join public.ciudades c on c.id = b.ciudad_id
    where i.id = target_id
      and i.deleted_at is null
  )
  select
    i.id,
    i.titulo,
    i.precio,
    i.moneda,
    i.tipo_propiedad,
    i.operacion,
    b.nombre as barrio_nombre,
    c.nombre as ciudad_nombre,
    d.nombre as departamento_nombre,
    (
      select img.url_storage
      from public.imagenes img
      where img.inmueble_id = i.id
      order by img.orden, img.id
      limit 1
    ) as imagen_path,
    i.slug
  from public.inmuebles i
  cross join target t
  left join public.barrios b on b.id = i.barrio_id
  left join public.ciudades c on c.id = b.ciudad_id
  left join public.departamentos d on d.id = c.departamento_id
  where i.id <> t.id
    and i.estado = 'Disponible'
    and i.operacion = t.operacion
    and i.deleted_at is null
  order by
    (
      case when i.barrio_id = t.barrio_id then 100 else 0 end +
      case when b.ciudad_id = t.ciudad_id then 50 else 0 end +
      case when c.departamento_id = t.departamento_id then 20 else 0 end +
      case when i.tipo_propiedad = t.tipo_propiedad then 10 else 0 end
    ) desc,
    case
      when i.moneda = t.moneda then abs(coalesce(i.precio, 0) - coalesce(t.precio, 0))
      else null
    end asc nulls last,
    i.creado_at desc
  limit least(greatest(coalesce(match_limit, 3), 1), 20);
$$;

grant execute on function public.match_nearby_inmuebles(uuid, integer)
    to anon, authenticated, service_role;

drop function if exists public.match_similar_inmuebles(uuid, integer, text);

create function public.match_similar_inmuebles(
    target_id uuid,
    match_limit integer default 6,
    model_name text default 'gemini-embedding-2'
)
returns table(
    id uuid,
    titulo text,
    descripcion text,
    tipo_propiedad public.tipo_propiedad_enum,
    operacion public.operacion_enum,
    precio numeric,
    moneda public.moneda_enum,
    superficie_terreno numeric,
    superficie_construida numeric,
    habitaciones integer,
    banos integer,
    servicios jsonb,
    estado public.estado_inmueble_enum,
    barrio_id uuid,
    barrio_nombre text,
    ciudad_nombre text,
    departamento_nombre text,
    imagen_path text,
    slug text,
    similarity double precision
)
language sql
stable
security definer
set search_path = ''
as $$
  with target as (
    select e.embedding, i.operacion
    from public.inmueble_embeddings e
    join public.inmuebles i on i.id = e.inmueble_id
    where e.inmueble_id = target_id and e.model = model_name
    limit 1
  )
  select
    i.id,
    i.titulo,
    i.descripcion,
    i.tipo_propiedad,
    i.operacion,
    i.precio,
    i.moneda,
    i.superficie_terreno,
    i.superficie_construida,
    i.habitaciones,
    i.banos,
    i.servicios,
    i.estado,
    i.barrio_id,
    b.nombre as barrio_nombre,
    c.nombre as ciudad_nombre,
    d.nombre as departamento_nombre,
    (
      select img.url_storage
      from public.imagenes img
      where img.inmueble_id = i.id
      order by img.orden, img.id
      limit 1
    ) as imagen_path,
    i.slug,
    1 - (e.embedding operator(extensions.<=>) t.embedding) as similarity
  from public.inmuebles i
  join public.inmueble_embeddings e
    on e.inmueble_id = i.id and e.model = model_name
  cross join target t
  left join public.barrios b on b.id = i.barrio_id
  left join public.ciudades c on c.id = b.ciudad_id
  left join public.departamentos d on d.id = c.departamento_id
  where i.id <> target_id
    and i.estado = 'Disponible'
    and i.operacion = t.operacion
    and i.deleted_at is null
  order by e.embedding operator(extensions.<=>) t.embedding asc
  limit least(greatest(coalesce(match_limit, 6), 1), 20);
$$;

grant execute on function public.match_similar_inmuebles(uuid, integer, text)
    to anon, authenticated, service_role;

-- 4. Estadísticas del panel con alquileres.
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
$$;
