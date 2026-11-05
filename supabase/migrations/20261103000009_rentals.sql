-- Alquileres (D15-D19): la operación es un eje separado del tipo de inmueble.
--
-- `tipo_propiedad` dice QUÉ es (Casa, Lote, Departamento); `operacion` dice
-- PARA QUÉ (Venta o Alquiler). No se mezclan en el mismo enum para no
-- duplicar la combinatoria (“Casa en alquiler”, “Lote en alquiler”…).
--
-- La moneda sigue en su columna: venta en USD y alquiler en Bs se fija en la
-- interfaz, no en la base, para poder reactivar el selector sin migración.
--
-- Esta migración va separada de la de funciones porque PostgreSQL no permite
-- usar un valor de enum nuevo (`Alquilado`) dentro de la misma transacción en
-- la que se añade.

do $$
begin
    if not exists (select 1 from pg_type where typname = 'operacion_enum') then
        create type public.operacion_enum as enum ('Venta', 'Alquiler');
    end if;
end $$;

alter table public.inmuebles
    add column if not exists operacion public.operacion_enum not null default 'Venta';

alter type public.estado_inmueble_enum add value if not exists 'Alquilado';

create index if not exists idx_inmuebles_operacion_estado_publicado
    on public.inmuebles (operacion, estado, publicado_at desc)
    where deleted_at is null;

comment on column public.inmuebles.operacion is
    'Venta o Alquiler. Eje independiente de tipo_propiedad.';
