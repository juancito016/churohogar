-- Corrige la marca de actualización de `configuracion_negocio`.
--
-- La migración 20261103000004 reutilizó `set_updated_at()`, que escribe
-- `new.updated_at`, pero la columna de esta tabla se llama `actualizado_at`.
-- El UPDATE fallaba con `42703 record "new" has no field "updated_at"`.

create or replace function public.set_configuracion_negocio_actualizado_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.actualizado_at = now();
    return new;
end;
$$;

drop trigger if exists set_configuracion_negocio_updated_at on public.configuracion_negocio;

create trigger set_configuracion_negocio_actualizado_at
    before update on public.configuracion_negocio
    for each row execute function public.set_configuracion_negocio_actualizado_at();
