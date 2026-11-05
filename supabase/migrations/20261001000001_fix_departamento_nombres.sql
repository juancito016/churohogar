-- Corrige tildes/errores ortográficos en nombres de departamentos.
-- Idempotente: seguro de ejecutar varias veces.

UPDATE departamentos SET nombre = 'La Paz' WHERE nombre = 'Lapaz';
UPDATE departamentos SET nombre = 'Potosí' WHERE nombre = 'Potosi';
