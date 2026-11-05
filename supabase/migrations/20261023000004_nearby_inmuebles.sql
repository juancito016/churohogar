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

revoke all on function public.match_nearby_inmuebles(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.match_nearby_inmuebles(uuid, integer)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';
