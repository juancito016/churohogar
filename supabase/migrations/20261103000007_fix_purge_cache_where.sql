-- Corrige la purga completa de la caché.
--
-- `pg_safeupdate` (activo en Supabase) bloquea cualquier DELETE sin WHERE con
-- el error 21000 (`DELETE requires a WHERE clause`), también dentro de una
-- función. La purga completa usaba `delete from ...` sin condición y fallaba;
-- se añade `where true` para conservar el comportamiento de vaciar todo.

create or replace function public.admin_purge_cache(solo_expiradas boolean default false)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    borradas integer;
begin
    if not public.is_admin() then
        raise exception 'Solo un administrador puede purgar la caché.'
            using errcode = '42501';
    end if;

    if coalesce(solo_expiradas, false) then
        delete from public.semantic_search_cache where results_expires_at <= now();
    else
        delete from public.semantic_search_cache where true;
    end if;

    get diagnostics borradas = row_count;
    return borradas;
end;
$$;

comment on function public.admin_purge_cache(boolean) is
    'Borra la caché de búsquedas; con true solo las entradas expiradas. Devuelve cuántas eliminó.';

revoke all on function public.admin_purge_cache(boolean) from public;
revoke all on function public.admin_purge_cache(boolean) from anon;
grant execute on function public.admin_purge_cache(boolean) to authenticated;
