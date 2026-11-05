-- Fase 2: columnas de búsqueda, embeddings y caché.
-- Idempotente para poder reaplicar sin romper datos existentes.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

alter table public.inmuebles
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists set_inmuebles_updated_at on public.inmuebles;
create trigger set_inmuebles_updated_at
before update on public.inmuebles
for each row execute function public.set_updated_at();

alter table public.inmuebles
  add column if not exists search_vector tsvector;

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
    setweight(to_tsvector('spanish'::regconfig, extensions.unaccent(coalesce(new.tipo_propiedad::text, ''))), 'D');

  return new;
end;
$$;

drop trigger if exists update_inmuebles_search_vector on public.inmuebles;
create trigger update_inmuebles_search_vector
before insert or update on public.inmuebles
for each row execute function public.inmuebles_search_vector_update();

update public.inmuebles
set search_vector = null
where search_vector is null;

create index if not exists idx_inmuebles_search_vector
  on public.inmuebles using gin (search_vector);

create table if not exists public.inmueble_embeddings (
  inmueble_id uuid not null references public.inmuebles(id) on delete cascade,
  model text not null,
  dimensions smallint not null default 768 check (dimensions = 768),
  content_hash text not null,
  content_text text not null,
  embedding extensions.vector(768) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (inmueble_id, model)
);

drop trigger if exists set_inmueble_embeddings_updated_at on public.inmueble_embeddings;
create trigger set_inmueble_embeddings_updated_at
before update on public.inmueble_embeddings
for each row execute function public.set_updated_at();

create index if not exists idx_inmueble_embeddings_embedding_hnsw
  on public.inmueble_embeddings
  using hnsw (embedding extensions.vector_cosine_ops)
  with (m = 16, ef_construction = 64);

create table if not exists public.semantic_search_cache (
  query_hash text primary key,
  query_text text not null,
  normalized_query text not null,
  filters jsonb not null default '{}'::jsonb,
  model text not null,
  dimensions smallint not null default 768 check (dimensions = 768),
  query_embedding extensions.vector(768) not null,
  result_ids uuid[] not null default '{}'::uuid[],
  result_payload jsonb not null default '[]'::jsonb,
  result_count integer not null default 0,
  data_version bigint not null,
  hits integer not null default 0,
  last_hit_at timestamptz,
  embedding_expires_at timestamptz not null,
  results_expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_semantic_search_cache_updated_at on public.semantic_search_cache;
create trigger set_semantic_search_cache_updated_at
before update on public.semantic_search_cache
for each row execute function public.set_updated_at();

create index if not exists idx_semantic_search_cache_results_expires_at
  on public.semantic_search_cache (results_expires_at);
create index if not exists idx_semantic_search_cache_embedding_expires_at
  on public.semantic_search_cache (embedding_expires_at);
create index if not exists idx_semantic_search_cache_last_hit_at
  on public.semantic_search_cache (last_hit_at);

create table if not exists public.search_cache_meta (
  id boolean primary key default true check (id = true),
  data_version bigint not null default 1,
  updated_at timestamptz not null default now()
);

insert into public.search_cache_meta (id, data_version)
values (true, 1)
on conflict (id) do nothing;

create or replace function public.bump_search_cache_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.search_cache_meta
  set data_version = data_version + 1,
      updated_at = now()
  where id = true;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists bump_cache_on_inmuebles on public.inmuebles;
create trigger bump_cache_on_inmuebles
after insert or update or delete on public.inmuebles
for each row execute function public.bump_search_cache_version();

drop trigger if exists bump_cache_on_imagenes on public.imagenes;
create trigger bump_cache_on_imagenes
after insert or update or delete on public.imagenes
for each row execute function public.bump_search_cache_version();

drop trigger if exists bump_cache_on_barrios on public.barrios;
create trigger bump_cache_on_barrios
after insert or update or delete on public.barrios
for each row execute function public.bump_search_cache_version();

drop trigger if exists bump_cache_on_ciudades on public.ciudades;
create trigger bump_cache_on_ciudades
after insert or update or delete on public.ciudades
for each row execute function public.bump_search_cache_version();

drop trigger if exists bump_cache_on_departamentos on public.departamentos;
create trigger bump_cache_on_departamentos
after insert or update or delete on public.departamentos
for each row execute function public.bump_search_cache_version();

alter table public.inmueble_embeddings enable row level security;
alter table public.semantic_search_cache enable row level security;
alter table public.search_cache_meta enable row level security;

revoke all on table public.inmueble_embeddings from anon, authenticated;
revoke all on table public.semantic_search_cache from anon, authenticated;
revoke all on table public.search_cache_meta from anon, authenticated;

grant select, insert, update, delete on table public.inmueble_embeddings to service_role;
grant select, insert, update, delete on table public.semantic_search_cache to service_role;
grant select, insert, update, delete on table public.search_cache_meta to service_role;

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.inmuebles_search_vector_update() from public, anon, authenticated;
revoke all on function public.bump_search_cache_version() from public, anon, authenticated;

grant execute on function public.set_updated_at() to service_role;
grant execute on function public.inmuebles_search_vector_update() to service_role;
grant execute on function public.bump_search_cache_version() to service_role;

notify pgrst, 'reload schema';
