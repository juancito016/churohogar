-- Configuración del negocio (ADM-30).
--
-- Hasta ahora el WhatsApp por defecto y los textos de SEO estaban fijos en el
-- código (`PropertyDetail.tsx`, `index.html`, `LandingPage.tsx`), así que
-- cambiarlos exigía un despliegue. Se mueven a una fila única editable desde
-- el panel.
--
-- La lectura es pública (son datos de contacto y SEO visibles en la web) y la
-- escritura queda para administradores con `is_admin()`.

create table if not exists public.configuracion_negocio (
    id boolean primary key default true,
    whatsapp text not null default '59164303730',
    mensaje_whatsapp text not null default '¡Hola ChuroHogar! Me interesa este inmueble:',
    seo_titulo text not null default 'Casas en Tarija | Venta de Inmuebles y Terrenos | Churo Hogar',
    seo_descripcion text not null default 'La mejor plataforma inmobiliaria para encontrar, comprar o vender tu casa, departamento o terreno ideal en Tarija y toda Bolivia.',
    actualizado_at timestamptz not null default now(),
    constraint configuracion_negocio_singleton check (id),
    constraint configuracion_negocio_whatsapp_formato check (whatsapp ~ '^[0-9]{8,15}$'),
    constraint configuracion_negocio_seo_titulo_largo check (char_length(btrim(seo_titulo)) between 10 and 120),
    constraint configuracion_negocio_seo_descripcion_largo check (char_length(btrim(seo_descripcion)) between 40 and 320),
    constraint configuracion_negocio_mensaje_largo check (char_length(btrim(mensaje_whatsapp)) between 5 and 200)
);

comment on table public.configuracion_negocio is
    'Fila única con WhatsApp por defecto, mensaje inicial y textos de SEO. Se edita desde Panel → Sistema.';

drop trigger if exists set_configuracion_negocio_updated_at on public.configuracion_negocio;
create trigger set_configuracion_negocio_updated_at
    before update on public.configuracion_negocio
    for each row execute function public.set_updated_at();

insert into public.configuracion_negocio (id)
values (true)
on conflict (id) do nothing;

alter table public.configuracion_negocio enable row level security;

drop policy if exists "Public Read Configuracion" on public.configuracion_negocio;
create policy "Public Read Configuracion"
    on public.configuracion_negocio for select
    using (true);

drop policy if exists "Admin Insert Configuracion" on public.configuracion_negocio;
create policy "Admin Insert Configuracion"
    on public.configuracion_negocio for insert
    to authenticated
    with check (public.is_admin());

drop policy if exists "Admin Update Configuracion" on public.configuracion_negocio;
create policy "Admin Update Configuracion"
    on public.configuracion_negocio for update
    to authenticated
    using (public.is_admin())
    with check (public.is_admin());
