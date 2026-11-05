-- Publicaciones con fecha de publicación y vencimiento.
--
-- - `publicado_at`: cuándo salió al público (se actualiza al publicar o renovar).
-- - `expira_at`: cuándo deja de verse. `NULL` = publicación permanente.
-- El vencimiento se materializa en el estado `Vencido` mediante un cron
-- (ver 20261029000003), para que el listado, el sitemap y el buscador semántico
-- lo excluyan sin tocar sus consultas y para invalidar la caché.

alter table public.inmuebles
    add column if not exists publicado_at timestamptz,
    add column if not exists expira_at timestamptz;

-- Los inmuebles existentes se publicaron cuando se crearon.
update public.inmuebles
   set publicado_at = coalesce(publicado_at, creado_at, now())
 where publicado_at is null;

alter table public.inmuebles
    alter column publicado_at set default now(),
    alter column publicado_at set not null;

-- Un vencimiento anterior a la publicación no tiene sentido.
do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'inmuebles_expira_despues_de_publicar'
          and conrelid = 'public.inmuebles'::regclass
    ) then
        alter table public.inmuebles
            add constraint inmuebles_expira_despues_de_publicar
            check (expira_at is null or expira_at > publicado_at);
    end if;
end;
$$;

-- Para el cron (buscar vencidos) y para el filtro "por vencer" del panel.
create index if not exists idx_inmuebles_estado_expira
    on public.inmuebles (estado, expira_at)
    where deleted_at is null;

create index if not exists idx_inmuebles_publicado_at
    on public.inmuebles (publicado_at desc)
    where deleted_at is null;

comment on column public.inmuebles.publicado_at is
    'Cuándo salió al público por última vez (crear, reactivar o renovar).';
comment on column public.inmuebles.expira_at is
    'Fin de la publicación. NULL = permanente. Al pasar, el cron lo deja en estado Vencido.';

-- Nuevo estado. Va al final y en su propia sentencia: PostgreSQL no deja usar
-- un valor de enum recién añadido dentro de la misma transacción, y aquí no se usa.
alter type public.estado_inmueble_enum add value if not exists 'Vencido';
