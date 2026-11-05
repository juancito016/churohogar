do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'inmuebles_precio_positivo'
      and conrelid = 'public.inmuebles'::regclass
  ) then
    alter table public.inmuebles
      add constraint inmuebles_precio_positivo check (precio > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'inmuebles_superficie_terreno_no_negativa'
      and conrelid = 'public.inmuebles'::regclass
  ) then
    alter table public.inmuebles
      add constraint inmuebles_superficie_terreno_no_negativa
      check (superficie_terreno is null or superficie_terreno >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'inmuebles_superficie_construida_no_negativa'
      and conrelid = 'public.inmuebles'::regclass
  ) then
    alter table public.inmuebles
      add constraint inmuebles_superficie_construida_no_negativa
      check (superficie_construida is null or superficie_construida >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'inmuebles_habitaciones_no_negativas'
      and conrelid = 'public.inmuebles'::regclass
  ) then
    alter table public.inmuebles
      add constraint inmuebles_habitaciones_no_negativas
      check (habitaciones is null or habitaciones >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'inmuebles_banos_no_negativos'
      and conrelid = 'public.inmuebles'::regclass
  ) then
    alter table public.inmuebles
      add constraint inmuebles_banos_no_negativos
      check (banos is null or banos >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'inmuebles_descripcion_longitud'
      and conrelid = 'public.inmuebles'::regclass
  ) then
    alter table public.inmuebles
      add constraint inmuebles_descripcion_longitud
      check (char_length(descripcion) between 80 and 300);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'inmuebles_servicios_array'
      and conrelid = 'public.inmuebles'::regclass
  ) then
    alter table public.inmuebles
      add constraint inmuebles_servicios_array
      check (jsonb_typeof(servicios) = 'array');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'inmuebles_slug_formato'
      and conrelid = 'public.inmuebles'::regclass
  ) then
    alter table public.inmuebles
      add constraint inmuebles_slug_formato
      check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
  end if;
end $$;

alter table public.inmuebles alter column slug set not null;
alter table public.inmuebles alter column servicios set not null;
