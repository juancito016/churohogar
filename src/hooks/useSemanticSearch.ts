/**
 * F5/F6 — Búsqueda semántica desde el cliente.
 *
 * Solo habla con la Edge Function `semantic-search`: la clave de Gemini y el
 * `service_role` se quedan en el servidor. Si la función no responde, quien
 * llame debe seguir mostrando el listado normal (la búsqueda es un extra).
 */

import { useCallback, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { readFunctionError } from '../utils/syncEmbedding';

const FUNCTION_NAME = 'semantic-search';

export type SemanticSearchFilters = {
    tipo?: string;
    /** `Venta` o `Alquiler`; el servidor detecta la del texto si no viaja. */
    operacion?: string;
    /** `Bs` o `USD`; normalmente se deriva de la operación. */
    moneda?: string;
    precio_min?: number | string;
    precio_max?: number | string;
    departamento_id?: string;
    ciudad_id?: string;
    barrio_id?: string;
};

export type SemanticInmuebleCard = {
    id: string;
    titulo: string;
    descripcion: string;
    tipo_propiedad: string;
    operacion: string;
    precio: number;
    moneda: string;
    superficie_terreno: number | null;
    superficie_construida: number | null;
    habitaciones: number;
    banos: number;
    servicios: string[];
    estado: string;
    slug: string;
    contacto: string | null;
    barrio_id: string;
    ubicacion: string;
    barrios: {
        nombre: string;
        ciudades: {
            nombre: string;
            departamentos: { nombre: string };
        };
    };
    imagenes: Array<{ url_storage: string; orden: number | null }>;
    portadaUrl: string | null;
    similarity: number;
    text_rank: number;
};

export type SemanticLocationMention = { id: string; nombre: string } | null;

export type SemanticBudget = { min: number | null; max: number | null; moneda?: 'Bs' | 'USD' | null } | null;

export type SemanticSearchResponse = {
    ok: boolean;
    cached: boolean;
    cache: 'hit' | 'reused-embedding' | 'fresh' | 'session';
    query: string;
    normalized_query: string;
    filters: {
        tipo: string | null;
        operacion: string | null;
        moneda: string | null;
        precio_min: number | null;
        precio_max: number | null;
        departamento_id: string | null;
        ciudad_id: string | null;
        barrio_id: string | null;
    };
    detected: {
        barrio: SemanticLocationMention;
        ciudad: SemanticLocationMention;
        departamento: SemanticLocationMention;
        /** Presupuesto leído del texto; `null` si no se mencionó o se pidió ignorarlo. */
        presupuesto?: SemanticBudget;
        /** Operación deducida del texto (`Venta` si no se dijo nada). */
        operacion?: string;
    };
    count: number;
    results: SemanticInmuebleCard[];
    model: string;
    dimensions: number;
    timings: {
        total_ms: number;
        cache_ms?: number;
        catalog_ms?: number;
        embedding_ms: number;
        search_ms: number;
    };
};

/**
 * F7-08 — Caché de sesión del navegador.
 *
 * Repetir la misma búsqueda en la misma pestaña se resuelve al instante sin
 * tocar el servidor. Vive en `sessionStorage` (se limpia al cerrar la pestaña)
 * y caduca a los 5 minutos, así que una edición del administrador no deja
 * resultados viejos más allá de ese margen.
 */
const SESSION_CACHE_TTL_MS = 5 * 60 * 1000;
const SESSION_CACHE_PREFIX = 'churo:search:';

type SessionCacheEntry = { savedAt: number; payload: SemanticSearchResponse };

const buildSessionKey = (
    query: string,
    filters: SemanticSearchFilters,
    options: { limit?: number; ignoreBudget?: boolean }
): string => {
    const f = Object.entries(cleanFilters(filters))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${String(value)}`)
        .join('&');
    const q = query.trim().toLowerCase().replace(/\s+/g, ' ');
    const limit = options.limit ?? 24;
    const ignore = options.ignoreBudget ? '1' : '0';
    return `${SESSION_CACHE_PREFIX}${q}|${f}|${limit}|${ignore}`;
};

const readSessionCache = (key: string): SemanticSearchResponse | null => {
    try {
        const raw = sessionStorage.getItem(key);
        if (!raw) return null;
        const entry = JSON.parse(raw) as SessionCacheEntry;
        if (!entry || typeof entry.savedAt !== 'number' || !entry.payload) return null;
        if (Date.now() - entry.savedAt > SESSION_CACHE_TTL_MS) {
            sessionStorage.removeItem(key);
            return null;
        }
        return entry.payload;
    } catch {
        return null;
    }
};

const writeSessionCache = (key: string, payload: SemanticSearchResponse) => {
    try {
        sessionStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), payload } satisfies SessionCacheEntry));
    } catch {
        // Cuota de sessionStorage llena: se ignora y se sigue sin caché local.
    }
};

/** Marca un resultado servido desde la caché de sesión para que la UI lo informe. */
const markSessionHit = (payload: SemanticSearchResponse): SemanticSearchResponse => ({
    ...payload,
    cached: true,
    cache: 'session',
    timings: { ...payload.timings, total_ms: 0 },
});

const cleanFilters = (filters: SemanticSearchFilters) => {
    const entries = Object.entries(filters).filter(([, value]) => {
        if (value === undefined || value === null) return false;
        return String(value).trim() !== '';
    });

    return Object.fromEntries(entries);
};

export const useSemanticSearch = () => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<SemanticSearchResponse | null>(null);

    const search = useCallback(async (
        query: string,
        filters: SemanticSearchFilters = {},
        options: { limit?: number; ignoreBudget?: boolean; useSessionCache?: boolean } = {}
    ) => {
        const useSessionCache = options.useSessionCache === true;
        const cacheKey = useSessionCache ? buildSessionKey(query, filters, options) : null;

        // F7-08: una repetición exacta se sirve al instante desde sessionStorage.
        if (cacheKey) {
            const cached = readSessionCache(cacheKey);
            if (cached) {
                const payload = markSessionHit(cached);
                setData(payload);
                setError(null);
                return payload;
            }
        }

        setLoading(true);
        setError(null);

        try {
            const { data: response, error: invokeError } = await supabase.functions.invoke(FUNCTION_NAME, {
                body: {
                    query,
                    filters: cleanFilters(filters),
                    ...(options.limit ? { limit: options.limit } : {}),
                    ...(options.ignoreBudget ? { ignore_budget: true } : {}),
                },
            });

            if (invokeError) throw new Error(await readFunctionError(invokeError));

            const payload = response as SemanticSearchResponse | null;
            if (!payload?.ok) {
                throw new Error('La búsqueda no devolvió resultados válidos.');
            }

            setData(payload);
            if (cacheKey) writeSessionCache(cacheKey, payload);
            return payload;
        } catch (searchError) {
            const message = searchError instanceof Error
                ? searchError.message
                : 'No se pudo completar la búsqueda.';
            setError(message);
            throw new Error(message);
        } finally {
            setLoading(false);
        }
    }, []);

    const reset = useCallback(() => {
        setData(null);
        setError(null);
    }, []);

    return { search, reset, data, loading, error };
};
