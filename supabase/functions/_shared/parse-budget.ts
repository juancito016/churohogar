/**
 * Detección del presupuesto escrito en el texto libre.
 *
 * Los embeddings captan una noción difusa de “barato”, pero no hacen aritmética:
 * “casa en San Blas por menos de 50 mil dólares” devolvía casas de USD 165.000 y
 * USD 172.000. Este módulo traduce el importe a `precio_min`/`precio_max` reales,
 * sin llamar a Gemini, para que el RPC filtre de verdad.
 *
 * Reglas:
 * - Solo se interpretan números con intención de precio: llevan un comparador
 *   (“menos de”, “hasta”, “desde”…) o una moneda (“dólares”, “USD”, “$”).
 * - Se ignoran los números seguidos de unidades que no son dinero
 *   (“200 m²”, “3 habitaciones”, “2 ambientes”, “2 baños”).
 * - “entre 40 y 60 mil” se interpreta como rango; “50 mil” hereda el multiplicador.
 * - Los filtros explícitos del formulario siempre mandan sobre el texto.
 */

export type Currency = 'Bs' | 'USD';

export type DetectedBudget = {
    min: number | null;
    max: number | null;
    /** Moneda mencionada en el texto; `null` si no se dijo ninguna. */
    moneda: Currency | null;
};

/** Importe mínimo creíble para un inmueble; por debajo se descarta el número. */
const MIN_AMOUNT = 500;

const MAX_WORDS = /\b(?:por menos de|menos de|hasta|como maximo|maximo|maxima|max|por debajo de|no mas de|no supere|no pase de|inferior a|menor a|menor que|como mucho|presupuesto de|presupuesto maximo de|tope de|limite de)\b/g;

const MIN_WORDS = /\b(?:mas de|desde|como minimo|minimo|minima|min|a partir de|superior a|mayor a|mayor que|arrancando en|empezando en)\b/g;

const RANGE_PATTERN = /(?:entre|de|desde)\s+(\d[\d.,]*)\s*(millon(?:es)?|mil(?:es)?|k)?\s*(?:y|a|hasta)\s+(\d[\d.,]*)\s*(millon(?:es)?|mil(?:es)?|k)?/;

const NUMBER_PATTERN = /(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)\s*(millon(?:es)?|mil(?:es)?|k)?/g;

const NOT_MONEY_AFTER = /^\s*(m2|m²|mt2|metros|habitacion|habitaciones|dormitorio|dormitorios|ambiente|ambientes|bano|banos|garaje|garajes|piso|pisos|ano|anos|personas|cuotas|por ciento|%)/;

const CURRENCY_PATTERN = /(dolar|dolares|usd|us\$|\$|boliviano|bolivianos|bob)/;

/** Moneda mencionada: gana la primera que aparece en el texto. */
const detectCurrency = (text: string): Currency | null => {
    const bolivianos = text.search(/boliviano|bolivianos|bob/);
    const dolares = text.search(/dolar|dolares|usd|us\$|\$/);

    if (bolivianos === -1 && dolares === -1) return null;
    if (bolivianos === -1) return 'USD';
    if (dolares === -1) return 'Bs';
    return bolivianos < dolares ? 'Bs' : 'USD';
};

const stripAccents = (value: string) =>
    value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();

const parseAmount = (raw: string, suffix?: string) => {
    let normalized = raw;

    // “80.000” y “80,000” son separadores de miles; “50,5” sería decimal.
    if (/^\d{1,3}(?:[.,]\d{3})+$/.test(raw)) {
        normalized = raw.replace(/[.,]/g, '');
    } else {
        normalized = raw.replace(',', '.');
    }

    let value = Number(normalized);
    if (!Number.isFinite(value)) return null;

    const unit = (suffix ?? '').toLowerCase();
    if (unit.startsWith('millon')) value *= 1_000_000;
    else if (unit.startsWith('mil') || unit === 'k') value *= 1_000;

    return value;
};

/** Posición final de la última aparición del patrón dentro del texto. */
const lastMatchEnd = (text: string, pattern: RegExp) => {
    const global = new RegExp(pattern.source, 'g');
    let end = -1;
    let match: RegExpExecArray | null;

    while ((match = global.exec(text)) !== null) {
        end = match.index + match[0].length;
        if (match[0].length === 0) global.lastIndex += 1;
    }

    return end;
};

const hasNotMoneyUnit = (text: string) => NOT_MONEY_AFTER.test(text);

/**
 * Devuelve el presupuesto detectado o `null` si el texto no menciona dinero.
 */
export const parseBudgetFromText = (query: string): DetectedBudget | null => {
    const text = stripAccents(query);
    if (!text) return null;

    const rangeMatch = RANGE_PATTERN.exec(text);
    if (rangeMatch) {
        const afterRange = text.slice(rangeMatch.index + rangeMatch[0].length, rangeMatch.index + rangeMatch[0].length + 18);
        const unit = rangeMatch[2] ?? rangeMatch[4];
        const first = parseAmount(rangeMatch[1], rangeMatch[2] ?? unit);
        const second = parseAmount(rangeMatch[3], rangeMatch[4] ?? unit);
        // “entre 40 y 60 mil” o “entre 100.000 y 150.000”: importes grandes sin
        // multiplicador también son dinero; cifras pequeñas son habitaciones o m².
        const looksLikeMoney = Boolean(unit)
            || (first !== null && second !== null && first >= 5000 && second >= 5000);

        if (looksLikeMoney && !hasNotMoneyUnit(afterRange) && first !== null && second !== null) {
            const min = Math.min(first, second);
            const max = Math.max(first, second);
            if (min >= MIN_AMOUNT) return { min, max, moneda: detectCurrency(text) };
        }
    }

    let detectedMin: number | null = null;
    let detectedMax: number | null = null;

    NUMBER_PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = NUMBER_PATTERN.exec(text)) !== null) {
        const value = parseAmount(match[1], match[2] ?? undefined);
        const matchEnd = match.index + match[0].length;
        const after = text.slice(matchEnd, matchEnd + 18);

        if (value === null || value < MIN_AMOUNT) continue;
        if (hasNotMoneyUnit(after)) continue;

        const before = text.slice(Math.max(0, match.index - 40), match.index);
        const maxEnd = lastMatchEnd(before, MAX_WORDS);
        const minEnd = lastMatchEnd(before, MIN_WORDS);
        const mentionsMoney = CURRENCY_PATTERN.test(before) || CURRENCY_PATTERN.test(after) || Boolean(match[2]);

        let mode: 'min' | 'max' | null = null;
        if (maxEnd >= 0 && maxEnd > minEnd) mode = 'max';
        else if (minEnd >= 0 && minEnd > maxEnd) mode = 'min';
        else if (mentionsMoney) mode = 'max';

        if (mode === 'max') {
            detectedMax = detectedMax === null ? value : Math.min(detectedMax, value);
        } else if (mode === 'min') {
            detectedMin = detectedMin === null ? value : Math.max(detectedMin, value);
        }
    }

    if (detectedMin === null && detectedMax === null) return null;
    // Un rango incoherente (“desde 80 mil hasta 50 mil”) se queda con el tope.
    if (detectedMin !== null && detectedMax !== null && detectedMin >= detectedMax) detectedMin = null;

    return { min: detectedMin, max: detectedMax, moneda: detectCurrency(text) };
};
