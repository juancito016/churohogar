-- ============================================================
-- Índice compuesto para filtros de tipo y precio
-- Fecha: 2026-10-22
-- ============================================================

create index if not exists idx_inmuebles_tipo_precio
  on public.inmuebles (tipo_propiedad, precio);
