-- ============================================================
-- Reconciliación de drift de migraciones
-- Fecha: 2026-10-21
-- Objetivo:
--   1. Completar lo que faltó de 20261001000000.
--   2. Aplicar la corrección de nombres de 20261001000001.
--   3. Dejar el registro de versiones al runner de migraciones.
--
-- Nota: la BD ya tiene un UNIQUE constraint llamado inmuebles_slug_key.
-- No se crea el índice idx_inmuebles_slug del archivo original para
-- evitar un índice único duplicado.
--
-- Aplicar con `supabase db push` (o el runner de migraciones).
-- No insertar manualmente en supabase_migrations.schema_migrations:
-- el runner registra cada versión al aplicarla.
-- ============================================================

-- 1) Índice de imágenes que faltaba.
create index if not exists idx_imagenes_inmueble
  on public.imagenes (inmueble_id, orden);

-- 2) Normalización de nombres de departamentos.
update public.departamentos set nombre = 'La Paz' where nombre = 'Lapaz';
update public.departamentos set nombre = 'Potosí' where nombre = 'Potosi';

-- 3) El historial de migraciones lo registra el runner de Supabase.
--    No insertar filas a mano en supabase_migrations.schema_migrations:
--    hacerlo desalinea el estado local y el remoto.
