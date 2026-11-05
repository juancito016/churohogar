-- ADM-15: papelera con restauración para inmuebles.
-- El borrado desde el panel pasa a ser lógico; la fila y sus imágenes se conservan.

alter table public.inmuebles
  add column if not exists deleted_at timestamptz;

create index if not exists idx_inmuebles_deleted_at
  on public.inmuebles (deleted_at);

drop policy if exists "Public Read Inmuebles" on public.inmuebles;
create policy "Public Read Inmuebles"
  on public.inmuebles
  for select
  using (deleted_at is null);

drop policy if exists "Admin Read Inmuebles" on public.inmuebles;
create policy "Admin Read Inmuebles"
  on public.inmuebles
  for select
  to authenticated
  using (public.is_admin());

create or replace function public.match_nearby_inmuebles(
  target_id uuid,
  match_limit integer default 3
)
returns table (
  id uuid,
  titulo text,
  precio numeric,
  moneda public.moneda_enum,
  tipo_propiedad public.tipo_propiedad_enum,
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
      i.precio
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
    and i.deleted_at is null
  order by
    (
      case when i.barrio_id = t.barrio_id then 100 else 0 end +
      case when b.ciudad_id = t.ciudad_id then 50 else 0 end +
      case when c.departamento_id = t.departamento_id then 20 else 0 end +
      case when i.tipo_propiedad = t.tipo_propiedad then 10 else 0 end
    ) desc,
    abs(coalesce(i.precio, 0) - coalesce(t.precio, 0)) asc,
    i.creado_at desc
  limit least(greatest(coalesce(match_limit, 3), 1), 20);
$$;

create or replace function public.match_similar_inmuebles(
  target_id uuid,
  match_limit integer default 6,
  model_name text default 'gemini-embedding-2'
)
returns table (
  id uuid,
  titulo text,
  descripcion text,
  tipo_propiedad public.tipo_propiedad_enum,
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
    select embedding
    from public.inmueble_embeddings
    where inmueble_id = target_id and model = model_name
    limit 1
  )
  select
    i.id,
    i.titulo,
    i.descripcion,
    i.tipo_propiedad,
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
    and i.deleted_at is null
  order by e.embedding operator(extensions.<=>) t.embedding asc
  limit least(greatest(coalesce(match_limit, 6), 1), 20);
$$;

create or replace function public.match_inmuebles(
  query_embedding extensions.vector(768) default null,
  query_text text default '',
  match_limit integer default 12,
  model_name text default 'gemini-embedding-2',
  filter_tipo public.tipo_propiedad_enum default null,
  filter_precio_min numeric default null,
  filter_precio_max numeric default null,
  filter_departamento_id uuid default null,
  filter_ciudad_id uuid default null,
  filter_barrio_id uuid default null,
  filter_estado public.estado_inmueble_enum default 'Disponible'
)
returns table (
  id uuid,
  titulo text,
  descripcion text,
  tipo_propiedad public.tipo_propiedad_enum,
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
      and (filter_precio_min is null or i.precio >= filter_precio_min)
      and (filter_precio_max is null or i.precio <= filter_precio_max)
      and (filter_departamento_id is null or d.id = filter_departamento_id)
      and (filter_ciudad_id is null or c.id = filter_ciudad_id)
      and (filter_barrio_id is null or i.barrio_id = filter_barrio_id)
      and i.deleted_at is null
  )
  select
    id, titulo, descripcion, tipo_propiedad, precio, moneda,
    superficie_terreno, superficie_construida, habitaciones, banos,
    servicios, estado, barrio_id, barrio_nombre, ciudad_nombre,
    departamento_nombre, imagen_path, slug, similarity, text_rank
  from scored
  order by (similarity * 0.75 + text_rank * 0.25) desc, similarity desc, precio asc
  limit least(greatest(coalesce(match_limit, 12), 1), 50);
$$;

notify pgrst, 'reload schema';
