/**
 * Detección de la operación en el texto libre (D22).
 *
 * Regla acordada: cualquier palabra de alquiler gana, incluso si el texto
 * también dice “vendo” (“vendo o alquilo”). Sin palabras de alquiler se asume
 * Venta, porque hoy el catálogo es mayoritariamente de venta.
 */

export type Operacion = 'Venta' | 'Alquiler';

const RENT_WORDS = /\b(alquiler(?:es)?|alquil(?:o|as|a|an|ar)|arriend(?:o|as|a|an|ar)|rent(?:a|as|an|ar|o))\b/;

const stripAccents = (value: string) =>
    value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();

export const detectOperation = (query: string): Operacion =>
    RENT_WORDS.test(stripAccents(query)) ? 'Alquiler' : 'Venta';
