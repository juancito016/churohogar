-- ============================================================
-- Lote 3 · Campos de inmueble: moneda, servicios, slug, map_url, contacto
-- Script IDEMPOTENTE: es seguro ejecutarlo varias veces.
-- Aplicar con `supabase db push` o el runner de migraciones.
-- ============================================================

-- 1) Ampliar el enum de tipo de propiedad con 'Departamento'
--    (el schema original solo tenía 'Casa' y 'Lote')
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'tipo_propiedad_enum' AND e.enumlabel = 'Departamento'
  ) THEN
    ALTER TYPE tipo_propiedad_enum ADD VALUE 'Departamento';
  END IF;
END $$;

-- 2) Asegurar las columnas nuevas en inmuebles
ALTER TABLE public.inmuebles ADD COLUMN IF NOT EXISTS slug      text;
ALTER TABLE public.inmuebles ADD COLUMN IF NOT EXISTS map_url   text;
ALTER TABLE public.inmuebles ADD COLUMN IF NOT EXISTS contacto  text;
ALTER TABLE public.inmuebles ADD COLUMN IF NOT EXISTS servicios jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.inmuebles ADD COLUMN IF NOT EXISTS moneda    moneda_enum DEFAULT 'USD';

-- 3) La BD ya tiene el UNIQUE constraint inmuebles_slug_key sobre slug.
--    No se crea un índice único duplicado.

-- 4) Índices para filtros y orden de imágenes
CREATE INDEX IF NOT EXISTS idx_inmuebles_tipo_propiedad ON public.inmuebles(tipo_propiedad);
CREATE INDEX IF NOT EXISTS idx_inmuebles_precio         ON public.inmuebles(precio);
CREATE INDEX IF NOT EXISTS idx_imagenes_inmueble        ON public.imagenes(inmueble_id, orden);
