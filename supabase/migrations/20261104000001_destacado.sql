-- Destacado (ADM-17): etiqueta de visibilidad para el listado público.
--
-- `destacado` no participa en los embeddings ni en la búsqueda semántica
-- (que ordena por relevancia): solo sube el inmueble al principio del listado
-- por filtros y le pone una insignia. No invalida la caché de búsqueda por
-- contenido.

alter table public.inmuebles
    add column if not exists destacado boolean not null default false;

create index if not exists idx_inmuebles_destacado
    on public.inmuebles (destacado desc, publicado_at desc nulls last);

comment on column public.inmuebles.destacado is
    'Verdadero si el inmueble se muestra primero en el listado público (Destacado).';
