-- Corrige el vencimiento al renovar: debe caer al final del día en Bolivia,
-- igual que cuando se publica desde el formulario. Sin esto, una publicación
-- renovada a las 11:40 se apagaba a las 11:40 del último día, no a las 23:59.
--
-- Reglas:
--  - Si la publicación ya venció (o es permanente), se cuenta desde hoy y el
--    día de hoy es el primero: N días => fin del día (hoy + N - 1).
--  - Si sigue vigente, se suman N días a su vencimiento actual (que ya está al
--    final del día), así no se pierden los días que le quedaban.

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
               when i.expira_at is null or i.expira_at <= now() then
                   (
                       date_trunc('day', now() at time zone 'America/La_Paz')
                       + make_interval(days => dias - 1)
                       + interval '23:59:59.999'
                   ) at time zone 'America/La_Paz'
               else
                   i.expira_at + make_interval(days => dias)
           end
     where i.id = any(target_ids)
       and i.deleted_at is null
       and i.estado in ('Disponible', 'Vencido');

    get diagnostics afectados = row_count;
    return afectados;
end;
$$;

comment on function public.renew_publications(uuid[], integer) is
    'Reactiva y extiende una publicación hasta el final del día en Bolivia. dias = NULL la deja permanente.';
