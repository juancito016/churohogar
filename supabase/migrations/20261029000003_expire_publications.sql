-- Vencimiento automático de publicaciones + renovación desde el panel.
--
-- El vencimiento NO se calcula en cada consulta: se materializa en `estado`.
-- Así el listado, el sitemap y las funciones de búsqueda lo excluyen con el
-- filtro que ya tienen, y el UPDATE invalida la caché semántica.

create or replace function public.expire_publications()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    afectados integer;
begin
    update public.inmuebles
       set estado = 'Vencido'
     where estado = 'Disponible'
       and expira_at is not null
       and expira_at <= now()
       and deleted_at is null;

    get diagnostics afectados = row_count;

    if afectados > 0 then
        raise log 'expire_publications: % publicación(es) marcadas como Vencido', afectados;
    end if;

    return afectados;
end;
$$;

comment on function public.expire_publications() is
    'Marca como Vencido los inmuebles cuya publicación pasó su fecha. Lo llama pg_cron.';

revoke all on function public.expire_publications() from public;
revoke all on function public.expire_publications() from anon;
revoke all on function public.expire_publications() from authenticated;

-- Renovar (o hacer permanente) desde el panel. `dias = null` => permanente.
-- Extiende desde el vencimiento actual si aún está vigente, para no regalar
-- menos días a quien renueva antes de tiempo.
create or replace function public.renew_publications(target_ids uuid[], dias integer default 30)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    afectados integer;
begin
    if not public.is_admin() then
        raise exception 'Solo un administrador puede renovar publicaciones.'
            using errcode = '42501';
    end if;

    if target_ids is null or array_length(target_ids, 1) is null then
        raise exception 'Debes indicar al menos un inmueble.' using errcode = '22023';
    end if;

    if dias is not null and (dias < 1 or dias > 3650) then
        raise exception 'La duración debe estar entre 1 y 3650 días.' using errcode = '22023';
    end if;

    update public.inmuebles i
       set estado = 'Disponible',
           publicado_at = now(),
           expira_at = case
               when dias is null then null
               else greatest(coalesce(i.expira_at, now()), now()) + make_interval(days => dias)
           end
     where i.id = any(target_ids)
       and i.deleted_at is null
       and i.estado in ('Disponible', 'Vencido');

    get diagnostics afectados = row_count;
    return afectados;
end;
$$;

comment on function public.renew_publications(uuid[], integer) is
    'Reactiva y extiende una publicación. dias = NULL la deja permanente.';

revoke all on function public.renew_publications(uuid[], integer) from public;
revoke all on function public.renew_publications(uuid[], integer) from anon;
grant execute on function public.renew_publications(uuid[], integer) to authenticated;

-- Cada 5 minutos. La ventana máxima de visibilidad de algo ya vencido es 5 min.
do $$
begin
    if exists (select 1 from cron.job where jobname = 'expirar-publicaciones') then
        perform cron.unschedule('expirar-publicaciones');
    end if;
end;
$$;

select cron.schedule(
    'expirar-publicaciones',
    '*/5 * * * *',
    $$ select public.expire_publications(); $$
);
