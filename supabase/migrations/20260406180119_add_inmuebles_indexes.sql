-- ============================================================
-- Placeholder de historial: add_inmuebles_indexes
-- Fecha original: 2026-04-06
--
-- Esta versión ya existe registrada en la base remota, pero el
-- archivo se perdió del repositorio. Se recrea de forma
-- idempotente para que el historial local y el remoto coincidan.
--
-- No insertar manualmente en supabase_migrations.schema_migrations:
-- la versión la registra el runner al aplicar la migración.
-- ============================================================

create index if not exists idx_inmuebles_tipo_propiedad
  on public.inmuebles (tipo_propiedad);

create index if not exists idx_inmuebles_precio
  on public.inmuebles (precio);
