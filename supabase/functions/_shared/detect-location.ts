/**
 * Detección de ubicaciones dentro del texto libre de una búsqueda.
 *
 * F4-07 comprobó que la similitud semántica no prioriza la zona: “casa con
 * jardín en San Blas” devolvía primero una casa de El Molino. Por eso el texto
 * del usuario se traduce a filtros reales de barrio/ciudad/departamento.
 */

export type BarrioCatalogRow = {
    id: string;
    nombre: string;
    ciudad_id: string;
    ciudad_nombre: string;
    departamento_id: string;
    departamento_nombre: string;
    disponibles: number;
};

export type BarrioLocation = BarrioCatalogRow & {
    normalized: string;
    ciudad_normalized: string;
    departamento_normalized: string;
};

export type CiudadLocation = {
    id: string;
    nombre: string;
    normalized: string;
    departamento_id: string;
    departamento_nombre: string;
    disponibles: number;
};

export type DepartamentoLocation = {
    id: string;
    nombre: string;
    normalized: string;
    disponibles: number;
};

export type LocationCatalog = {
    barrios: BarrioLocation[];
    ciudades: CiudadLocation[];
    departamentos: DepartamentoLocation[];
};

export type LocationFilters = {
    departamento_id: string | null;
    ciudad_id: string | null;
    barrio_id: string | null;
};

export type LocationMention = { id: string; nombre: string } | null;

export type DetectedLocation = {
    barrio: LocationMention;
    ciudad: LocationMention;
    departamento: LocationMention;
};

export const normalizeText = (value: string) =>
    value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

export const buildCatalog = (rows: BarrioCatalogRow[]): LocationCatalog => {
    const barrios: BarrioLocation[] = [];
    const ciudades = new Map<string, CiudadLocation>();
    const departamentos = new Map<string, DepartamentoLocation>();

    for (const row of rows) {
        const disponibles = Number(row.disponibles) || 0;

        barrios.push({
            ...row,
            disponibles,
            normalized: normalizeText(row.nombre),
            ciudad_normalized: normalizeText(row.ciudad_nombre),
            departamento_normalized: normalizeText(row.departamento_nombre),
        });

        const ciudad = ciudades.get(row.ciudad_id);
        if (ciudad) {
            ciudad.disponibles += disponibles;
        } else {
            ciudades.set(row.ciudad_id, {
                id: row.ciudad_id,
                nombre: row.ciudad_nombre,
                normalized: normalizeText(row.ciudad_nombre),
                departamento_id: row.departamento_id,
                departamento_nombre: row.departamento_nombre,
                disponibles,
            });
        }

        const departamento = departamentos.get(row.departamento_id);
        if (departamento) {
            departamento.disponibles += disponibles;
        } else {
            departamentos.set(row.departamento_id, {
                id: row.departamento_id,
                nombre: row.departamento_nombre,
                normalized: normalizeText(row.departamento_nombre),
                disponibles,
            });
        }
    }

    return {
        barrios,
        ciudades: [...ciudades.values()],
        departamentos: [...departamentos.values()],
    };
};

const findMentions = <T extends { normalized: string }>(paddedQuery: string, entries: T[]) =>
    entries
        .filter(entry => entry.normalized.length > 0 && paddedQuery.includes(` ${entry.normalized} `))
        .sort((left, right) => right.normalized.length - left.normalized.length);

const pickBest = <T extends { disponibles: number }>(candidates: T[]): T | null => {
    if (candidates.length === 0) return null;

    const max = Math.max(...candidates.map(candidate => candidate.disponibles));
    const top = candidates.filter(candidate => candidate.disponibles === max);

    return top.length === 1 ? top[0] : null;
};

/**
 * Devuelve los filtros de ubicación efectivos: los explícitos mandan y, si no
 * los hay, se usan los nombres mencionados en la consulta. Ante nombres
 * repetidos (varios barrios “Centro”, “San Blas” en dos ciudades) se prefiere
 * el que tiene inmuebles disponibles; si sigue habiendo empate, no se filtra.
 */
export const detectLocation = (
    normalizedQuery: string,
    catalog: LocationCatalog,
    explicit: LocationFilters
): { filters: LocationFilters; detected: DetectedLocation } => {
    const padded = ` ${normalizedQuery} `;

    const barrioCandidates = findMentions(padded, catalog.barrios);
    const ciudadCandidates = findMentions(padded, catalog.ciudades);
    const departamentoCandidates = findMentions(padded, catalog.departamentos);

    let ciudad =
        (explicit.ciudad_id
            ? catalog.ciudades.find(item => item.id === explicit.ciudad_id) ?? null
            : null);

    if (!ciudad) {
        let candidates = ciudadCandidates;
        if (explicit.departamento_id) {
            candidates = candidates.filter(item => item.departamento_id === explicit.departamento_id);
        }
        ciudad = candidates.length === 1 ? candidates[0] : pickBest(candidates);
    }

    let barrio =
        (explicit.barrio_id
            ? catalog.barrios.find(item => item.id === explicit.barrio_id) ?? null
            : null);

    if (!barrio) {
        // La ciudad (explícita o detectada) desambigua barrios repetidos: “Centro de San Lorenzo”.
        const scopeCiudadId = explicit.ciudad_id ?? ciudad?.id ?? null;
        let candidates = barrioCandidates;

        if (scopeCiudadId) {
            candidates = candidates.filter(item => item.ciudad_id === scopeCiudadId);
        } else if (explicit.departamento_id) {
            candidates = candidates.filter(item => item.departamento_id === explicit.departamento_id);
        }

        barrio = candidates.length === 1 ? candidates[0] : pickBest(candidates);
    }

    let departamento =
        (explicit.departamento_id
            ? catalog.departamentos.find(item => item.id === explicit.departamento_id) ?? null
            : null);

    if (!departamento) {
        departamento = pickBest(departamentoCandidates);
    }

    return {
        filters: {
            departamento_id: departamento?.id ?? null,
            ciudad_id: ciudad?.id ?? null,
            barrio_id: barrio?.id ?? null,
        },
        detected: {
            barrio: barrio ? { id: barrio.id, nombre: barrio.nombre } : null,
            ciudad: ciudad ? { id: ciudad.id, nombre: ciudad.nombre } : null,
            departamento: departamento ? { id: departamento.id, nombre: departamento.nombre } : null,
        },
    };
};
