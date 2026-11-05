/**
 * F5 — Búsqueda semántica pública.
 *
 * Recibe texto libre y filtros, detecta barrio/ciudad/departamento en el texto,
 * reutiliza el embedding y los resultados guardados en caché, y devuelve
 * tarjetas listas para pintar. La clave de Gemini nunca sale del servidor.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import {
    buildCatalog,
    detectLocation,
    normalizeText,
    type BarrioCatalogRow,
    type DetectedLocation,
    type LocationCatalog,
} from '../_shared/detect-location.ts';
import { parseBudgetFromText, type Currency, type DetectedBudget } from '../_shared/parse-budget.ts';
import { detectOperation, type Operacion } from '../_shared/detect-operation.ts';
import { logError, logInfo, logWarn, shortQuery } from '../_shared/log.ts';

const EMBEDDING_MODEL = 'gemini-embedding-2';
const EMBEDDING_DIMENSIONS = 768;
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent`;

const MIN_QUERY_LENGTH = 3;
const MAX_QUERY_LENGTH = 200;
const DEFAULT_LIMIT = 12;
/** Tope por búsqueda: la caché va por consulta + límite, así que se fija para no repetir Gemini. */
const MAX_LIMIT = 24;

const RESULTS_TTL_HOURS = 24;
const EMBEDDING_TTL_DAYS = 180;
const CATALOG_TTL_MS = 10 * 60 * 1000;

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 40;

const TIPOS = ['Casa', 'Lote', 'Departamento'];
const OPERACIONES: Operacion[] = ['Venta', 'Alquiler'];
const MONEDAS: Currency[] = ['Bs', 'USD'];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type NormalizedFilters = {
    tipo: string | null;
    operacion: Operacion | null;
    moneda: Currency | null;
    precio_min: number | null;
    precio_max: number | null;
    departamento_id: string | null;
    ciudad_id: string | null;
    barrio_id: string | null;
};

type SearchRequest = {
    query: string;
    filters: NormalizedFilters;
    limit: number;
    /** Permite descartar el presupuesto escrito en el texto (“quiero ver todo”). */
    ignoreBudget: boolean;
};

/** `detected` incluye la zona, el presupuesto y la operación leídos del texto. */
type DetectedInfo = DetectedLocation & { presupuesto: DetectedBudget | null; operacion: Operacion };

/** Etiqueta corta de la zona detectada para los logs (`barrio:San Blas`). */
const zoneLabel = (detected: DetectedLocation | null | undefined) => {
    if (!detected) return null;
    if (detected.barrio) return `barrio:${detected.barrio.nombre}`;
    if (detected.ciudad) return `ciudad:${detected.ciudad.nombre}`;
    if (detected.departamento) return `departamento:${detected.departamento.nombre}`;
    return null;
};

type MatchRow = {
    id: string;
    titulo: string;
    descripcion: string;
    tipo_propiedad: string;
    operacion: string;
    precio: string | number;
    moneda: string;
    superficie_terreno: string | number | null;
    superficie_construida: string | number | null;
    habitaciones: number | null;
    banos: number | null;
    servicios: unknown;
    estado: string;
    barrio_id: string;
    barrio_nombre: string;
    ciudad_nombre: string;
    departamento_nombre: string;
    imagen_path: string | null;
    slug: string;
    similarity: number;
    text_rank: number;
};

type CachedSearch = {
    query_embedding: string;
    result_payload: unknown;
    result_count: number;
    filters: Record<string, unknown> | null;
    data_version: number;
    hits: number;
    embedding_expires_at: string;
    results_expires_at: string;
};

const jsonResponse = (body: unknown, status = 200, extraHeaders: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), {
        status,
        headers: {
            ...corsHeaders,
            ...extraHeaders,
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
        },
    });

const requireEnv = (name: string) => {
    const value = Deno.env.get(name);
    if (!value) throw new Error(`Falta la variable de entorno ${name}.`);
    return value;
};

/** Deja una tarea corriendo después de responder (runtime de Supabase Edge). */
const runInBackground = (task: Promise<unknown>) => {
    const runtime = (globalThis as {
        EdgeRuntime?: { waitUntil: (promise: Promise<unknown>) => void };
    }).EdgeRuntime;

    if (runtime?.waitUntil) {
        runtime.waitUntil(task);
        return;
    }

    void task;
};

const sha256 = async (value: string) => {
    const data = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest))
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');
};

const embedText = async (text: string, apiKey: string) => {
    const response = await fetch(GEMINI_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
            model: `models/${EMBEDDING_MODEL}`,
            content: { parts: [{ text }] },
            outputDimensionality: EMBEDDING_DIMENSIONS,
        }),
    });

    if (!response.ok) {
        const detail = await response.text();
        throw new Error(`Gemini respondió ${response.status}: ${detail.slice(0, 300)}`);
    }

    const payload = await response.json() as { embedding?: { values?: number[] } };
    const values = payload.embedding?.values;

    if (!Array.isArray(values) || values.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(`Gemini devolvió una dimensión inesperada: ${values?.length ?? 0}.`);
    }

    return values;
};

const emptyFilters = (): NormalizedFilters => ({
    tipo: null,
    operacion: null,
    moneda: null,
    precio_min: null,
    precio_max: null,
    departamento_id: null,
    ciudad_id: null,
    barrio_id: null,
});

const readPrice = (value: unknown, field: string) => {
    if (value === undefined || value === null || value === '') return null;

    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) {
        throw new Error(`${field} debe ser un número mayor o igual a 0.`);
    }

    return number;
};

const readUuid = (value: unknown, field: string) => {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string' || !UUID_PATTERN.test(value.trim())) {
        throw new Error(`${field} debe ser un UUID válido.`);
    }

    return value.trim();
};

const parseFilters = (raw: unknown): NormalizedFilters => {
    if (raw === undefined || raw === null) return emptyFilters();
    if (typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error('filters debe ser un objeto.');
    }

    const input = raw as Record<string, unknown>;
    const filters = emptyFilters();

    if (input.tipo !== undefined && input.tipo !== null && input.tipo !== '') {
        if (typeof input.tipo !== 'string' || !TIPOS.includes(input.tipo)) {
            throw new Error(`tipo debe ser uno de: ${TIPOS.join(', ')}.`);
        }
        filters.tipo = input.tipo;
    }

    filters.precio_min = readPrice(input.precio_min, 'precio_min');
    filters.precio_max = readPrice(input.precio_max, 'precio_max');
    filters.departamento_id = readUuid(input.departamento_id, 'departamento_id');
    filters.ciudad_id = readUuid(input.ciudad_id, 'ciudad_id');
    filters.barrio_id = readUuid(input.barrio_id, 'barrio_id');

    if (input.operacion !== undefined && input.operacion !== null && input.operacion !== '') {
        if (typeof input.operacion !== 'string' || !OPERACIONES.includes(input.operacion as Operacion)) {
            throw new Error(`operacion debe ser una de: ${OPERACIONES.join(', ')}.`);
        }
        filters.operacion = input.operacion as Operacion;
    }

    if (input.moneda !== undefined && input.moneda !== null && input.moneda !== '') {
        if (typeof input.moneda !== 'string' || !MONEDAS.includes(input.moneda as Currency)) {
            throw new Error(`moneda debe ser una de: ${MONEDAS.join(', ')}.`);
        }
        filters.moneda = input.moneda as Currency;
    }

    if (filters.precio_min !== null && filters.precio_max !== null && filters.precio_min > filters.precio_max) {
        throw new Error('precio_min no puede ser mayor que precio_max.');
    }

    return filters;
};

const parseRequest = async (request: Request): Promise<SearchRequest> => {
    const rawBody = await request.text();
    if (!rawBody.trim()) throw new Error('Falta el cuerpo de la búsqueda.');

    let body: unknown;
    try {
        body = JSON.parse(rawBody);
    } catch {
        throw new Error('El cuerpo debe ser JSON válido.');
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new Error('El cuerpo debe ser un objeto JSON.');
    }

    const input = body as Record<string, unknown>;

    if (typeof input.query !== 'string') {
        throw new Error('query es obligatorio y debe ser texto.');
    }

    const query = input.query.replace(/\s+/g, ' ').trim();
    if (query.length < MIN_QUERY_LENGTH) {
        throw new Error(`La búsqueda debe tener al menos ${MIN_QUERY_LENGTH} caracteres.`);
    }
    if (query.length > MAX_QUERY_LENGTH) {
        throw new Error(`La búsqueda admite hasta ${MAX_QUERY_LENGTH} caracteres.`);
    }

    let limit = DEFAULT_LIMIT;
    if (input.limit !== undefined && input.limit !== null) {
        if (!Number.isInteger(input.limit) || (input.limit as number) < 1 || (input.limit as number) > MAX_LIMIT) {
            throw new Error(`limit debe ser un entero entre 1 y ${MAX_LIMIT}.`);
        }
        limit = input.limit as number;
    }

    if (input.ignore_budget !== undefined && typeof input.ignore_budget !== 'boolean') {
        throw new Error('ignore_budget debe ser booleano.');
    }

    return {
        query,
        filters: parseFilters(input.filters),
        limit,
        ignoreBudget: input.ignore_budget === true,
    };
};

let catalogCache: { catalog: LocationCatalog; loadedAt: number } | null = null;

const loadCatalog = async (client: ReturnType<typeof createClient>) => {
    const { data, error } = await client
        .from('barrios')
        .select(`
            id,
            nombre,
            ciudades!inner(
                id,
                nombre,
                departamento_id,
                departamentos!inner(id, nombre)
            ),
            inmuebles(count)
        `)
        .eq('inmuebles.estado', 'Disponible')
        .is('inmuebles.deleted_at', null)
        .limit(1000);

    if (error) throw error;

    const rows = (data ?? []).map(row => {
        const ciudad = (row as { ciudades: { id: string; nombre: string; departamento_id: string; departamentos: { nombre: string } } }).ciudades;
        const inmuebles = (row as { inmuebles?: Array<{ count: number }> }).inmuebles;

        return {
            id: row.id,
            nombre: row.nombre,
            ciudad_id: ciudad.id,
            ciudad_nombre: ciudad.nombre,
            departamento_id: ciudad.departamento_id,
            departamento_nombre: ciudad.departamentos.nombre,
            disponibles: Number(inmuebles?.[0]?.count ?? 0),
        } satisfies BarrioCatalogRow;
    });

    return buildCatalog(rows);
};

const getCatalog = async (client: ReturnType<typeof createClient>) => {
    if (catalogCache && Date.now() - catalogCache.loadedAt < CATALOG_TTL_MS) {
        return catalogCache.catalog;
    }

    const catalog = await loadCatalog(client);
    catalogCache = { catalog, loadedAt: Date.now() };
    return catalog;
};

const splitStoredFilters = (stored: Record<string, unknown> | null) => {
    const detected = (stored?.detected ?? null) as DetectedInfo | null;

    return {
        filters: {
            tipo: (stored?.tipo as string | null) ?? null,
            operacion: (stored?.operacion as Operacion | null) ?? null,
            moneda: (stored?.moneda as Currency | null) ?? null,
            precio_min: (stored?.precio_min as number | null) ?? null,
            precio_max: (stored?.precio_max as number | null) ?? null,
            departamento_id: (stored?.departamento_id as string | null) ?? null,
            ciudad_id: (stored?.ciudad_id as string | null) ?? null,
            barrio_id: (stored?.barrio_id as string | null) ?? null,
        } satisfies NormalizedFilters,
        detected: detected ?? { barrio: null, ciudad: null, departamento: null, presupuesto: null, operacion: 'Venta' },
    };
};

const filtersKey = (filters: NormalizedFilters, limit: number) =>
    [
        ...Object.entries(filters)
            .filter(([, value]) => value !== null && value !== undefined)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, value]) => `${key}=${value}`),
        `limit=${limit}`,
    ].join('&');

const buildPublicUrl = (supabaseUrl: string, path: string) =>
    `${supabaseUrl}/storage/v1/object/public/fotos-inmuebles/${path.split('/').map(encodeURIComponent).join('/')}`;

const toNumberOrNull = (value: string | number | null) => {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
};

const round = (value: number) => Math.round(value * 10000) / 10000;

const buildCards = async (
    client: ReturnType<typeof createClient>,
    rows: MatchRow[],
    supabaseUrl: string
) => {
    if (rows.length === 0) return [];

    const ids = rows.map(row => row.id);

    const [{ data: imagenes, error: imagenesError }, { data: contactos, error: contactosError }] =
        await Promise.all([
            client
                .from('imagenes')
                .select('inmueble_id, url_storage, orden')
                .in('inmueble_id', ids)
                .order('orden', { ascending: true }),
            client.from('inmuebles').select('id, contacto').in('id', ids),
        ]);

    if (imagenesError) throw imagenesError;
    if (contactosError) throw contactosError;

    const fotosPorInmueble = new Map<string, Array<{ url_storage: string; orden: number | null }>>();
    for (const imagen of imagenes ?? []) {
        const list = fotosPorInmueble.get(imagen.inmueble_id) ?? [];
        list.push({ url_storage: imagen.url_storage, orden: imagen.orden ?? null });
        fotosPorInmueble.set(imagen.inmueble_id, list);
    }

    const contactoPorInmueble = new Map<string, string | null>();
    for (const inmueble of contactos ?? []) {
        contactoPorInmueble.set(inmueble.id, inmueble.contacto ?? null);
    }

    return rows.map(row => {
        const imagenes = fotosPorInmueble.get(row.id) ?? [];
        const portada = imagenes[0]?.url_storage ?? row.imagen_path ?? null;

        return {
            id: row.id,
            titulo: row.titulo,
            descripcion: row.descripcion,
            tipo_propiedad: row.tipo_propiedad,
            operacion: row.operacion,
            precio: Number(row.precio),
            moneda: row.moneda,
            superficie_terreno: toNumberOrNull(row.superficie_terreno),
            superficie_construida: toNumberOrNull(row.superficie_construida),
            habitaciones: row.habitaciones ?? 0,
            banos: row.banos ?? 0,
            servicios: Array.isArray(row.servicios) ? row.servicios : [],
            estado: row.estado,
            slug: row.slug,
            contacto: contactoPorInmueble.get(row.id) ?? null,
            barrio_id: row.barrio_id,
            ubicacion: [row.barrio_nombre, row.ciudad_nombre, row.departamento_nombre]
                .filter(Boolean)
                .join(', '),
            barrios: {
                nombre: row.barrio_nombre,
                ciudades: {
                    nombre: row.ciudad_nombre,
                    departamentos: { nombre: row.departamento_nombre },
                },
            },
            imagenes,
            portadaUrl: portada ? buildPublicUrl(supabaseUrl, portada) : null,
            similarity: round(Number(row.similarity ?? 0)),
            text_rank: round(Number(row.text_rank ?? 0)),
        };
    });
};

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

const checkRateLimit = (request: Request) => {
    const ip = (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim();
    if (!ip) return { allowed: true, retryAfter: 0 };

    const now = Date.now();
    const bucket = rateBuckets.get(ip);

    if (!bucket || bucket.resetAt <= now) {
        if (rateBuckets.size > 5000) {
            for (const [key, value] of rateBuckets) {
                if (value.resetAt <= now) rateBuckets.delete(key);
            }
        }
        rateBuckets.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
        return { allowed: true, retryAfter: 0 };
    }

    bucket.count += 1;
    if (bucket.count > RATE_LIMIT_MAX) {
        return { allowed: false, retryAfter: Math.max(Math.ceil((bucket.resetAt - now) / 1000), 1) };
    }

    return { allowed: true, retryAfter: 0 };
};

Deno.serve(async (request) => {
    if (request.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    if (request.method !== 'POST') {
        logWarn('search_rejected', { status: 405, reason: 'metodo', method: request.method });
        return jsonResponse({ error: 'Método no permitido.' }, 405);
    }

    const limitCheck = checkRateLimit(request);
    if (!limitCheck.allowed) {
        logWarn('search_rejected', {
            status: 429,
            reason: 'rate_limit',
            retry_after_s: limitCheck.retryAfter,
        });
        return jsonResponse(
            { error: 'Demasiadas búsquedas seguidas. Espera unos segundos.' },
            429,
            { 'Retry-After': String(limitCheck.retryAfter) }
        );
    }

    const startedAt = Date.now();

    try {
        const supabaseUrl = requireEnv('SUPABASE_URL');
        const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
        const geminiApiKey = requireEnv('GEMINI_API_KEY');

        const client = createClient(supabaseUrl, serviceRoleKey, {
            auth: { persistSession: false },
        });

        let parsed: SearchRequest;
        try {
            parsed = await parseRequest(request);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Búsqueda inválida.';
            logWarn('search_rejected', { status: 400, reason: 'invalida', message });
            return jsonResponse({ error: message }, 400);
        }

        const normalizedQuery = normalizeText(parsed.query);
        if (!normalizedQuery) {
            logWarn('search_rejected', {
                status: 400,
                reason: 'sin_palabras',
                q: shortQuery(parsed.query),
            });
            return jsonResponse({ error: 'La búsqueda no contiene palabras útiles.' }, 400);
        }

        // El presupuesto y la operación se leen del texto antes del hash: ambos
        // son deterministas y cambian la consulta, así que la caché no puede
        // devolver ventas a una búsqueda de alquiler.
        const textBudget = parsed.ignoreBudget ? null : parseBudgetFromText(parsed.query);
        const operacion = parsed.filters.operacion ?? detectOperation(parsed.query);
        const moneda = parsed.filters.moneda
            ?? textBudget?.moneda
            ?? (operacion === 'Alquiler' ? 'Bs' : 'USD');

        // Los filtros explícitos del formulario mandan; si no hay precio, se usa
        // el que el visitante escribió (“menos de 50 mil dólares”).
        const effectiveFilters: NormalizedFilters = {
            ...parsed.filters,
            operacion,
            moneda,
            precio_min: parsed.filters.precio_min ?? textBudget?.min ?? null,
            precio_max: parsed.filters.precio_max ?? textBudget?.max ?? null,
        };

        // El hash usa la consulta y los filtros efectivos. La detección de zona
        // es determinista y cualquier cambio del catálogo sube `data_version`,
        // así que el camino de caché no necesita leer ubicaciones.
        const queryHash = await sha256(
            `${EMBEDDING_MODEL}|${EMBEDDING_DIMENSIONS}|${normalizedQuery}|${filtersKey(effectiveFilters, parsed.limit)}|presupuesto=${parsed.ignoreBudget ? 'ignorado' : 'auto'}`
        );

        const cacheStartedAt = Date.now();
        const [cacheResult, metaResult] = await Promise.all([
            client
                .from('semantic_search_cache')
                .select('query_embedding, result_payload, result_count, filters, data_version, hits, embedding_expires_at, results_expires_at')
                .eq('query_hash', queryHash)
                .maybeSingle<CachedSearch>(),
            client
                .from('search_cache_meta')
                .select('data_version')
                .eq('id', true)
                .maybeSingle<{ data_version: number }>(),
        ]);

        if (cacheResult.error) throw cacheResult.error;
        if (metaResult.error) throw metaResult.error;

        const cachedRow = cacheResult.data;
        const cacheMs = Date.now() - cacheStartedAt;
        const dataVersion = Number(metaResult.data?.data_version ?? 0);
        const now = Date.now();
        const resultsFresh = Boolean(
            cachedRow && new Date(cachedRow.results_expires_at).getTime() > now
        );

        if (cachedRow && resultsFresh && Number(cachedRow.data_version) === dataVersion) {
            // La estadística del hit no debe sumar latencia a la respuesta.
            runInBackground(
                client
                    .from('semantic_search_cache')
                    .update({ hits: Number(cachedRow.hits) + 1, last_hit_at: new Date(now).toISOString() })
                    .eq('query_hash', queryHash)
                    .then(({ error }) => {
                        if (error) logError('cache_hit_update_failed', error, { query_hash: queryHash });
                    })
            );

            const stored = splitStoredFilters(cachedRow.filters);
            const totalMs = Date.now() - startedAt;

            logInfo('search', {
                status: 200,
                cache: 'hit',
                q: shortQuery(normalizedQuery),
                zona: zoneLabel(stored.detected),
                operacion: stored.filters.operacion,
                moneda: stored.filters.moneda,
                count: cachedRow.result_count,
                ms: totalMs,
                cache_ms: cacheMs,
            });

            return jsonResponse({
                ok: true,
                cached: true,
                cache: 'hit',
                query: parsed.query,
                normalized_query: normalizedQuery,
                filters: stored.filters,
                detected: stored.detected,
                count: cachedRow.result_count,
                results: cachedRow.result_payload,
                model: EMBEDDING_MODEL,
                dimensions: EMBEDDING_DIMENSIONS,
                timings: { total_ms: totalMs, cache_ms: cacheMs, catalog_ms: 0, embedding_ms: 0, search_ms: 0 },
            });
        }

        const catalogStartedAt = Date.now();
        const catalog = await getCatalog(client);
        const catalogMs = Date.now() - catalogStartedAt;
        const { filters: locationFilters, detected } = detectLocation(
            normalizedQuery,
            catalog,
            {
                departamento_id: parsed.filters.departamento_id,
                ciudad_id: parsed.filters.ciudad_id,
                barrio_id: parsed.filters.barrio_id,
            }
        );

        const filters: NormalizedFilters = { ...effectiveFilters, ...locationFilters };
        const budgetFromText = parsed.filters.precio_min === null && parsed.filters.precio_max === null
            ? textBudget
            : null;
        const detectedWithBudget: DetectedInfo = { ...detected, presupuesto: budgetFromText, operacion };

        let vector: string;
        let embeddingMs = 0;
        const canReuseEmbedding = Boolean(
            cachedRow && new Date(cachedRow.embedding_expires_at).getTime() > now
        );

        if (canReuseEmbedding && cachedRow) {
            vector = cachedRow.query_embedding;
        } else {
            const embeddingStartedAt = Date.now();
            const values = await embedText(parsed.query, geminiApiKey);
            embeddingMs = Date.now() - embeddingStartedAt;
            vector = JSON.stringify(values);
        }

        const searchStartedAt = Date.now();
        const { data: matches, error: searchError } = await client.rpc('match_inmuebles', {
            query_embedding: vector,
            query_text: parsed.query,
            match_limit: parsed.limit,
            model_name: EMBEDDING_MODEL,
            filter_tipo: filters.tipo,
            filter_precio_min: filters.precio_min,
            filter_precio_max: filters.precio_max,
            filter_departamento_id: filters.departamento_id,
            filter_ciudad_id: filters.ciudad_id,
            filter_barrio_id: filters.barrio_id,
            filter_estado: 'Disponible',
            filter_operacion: filters.operacion,
            filter_moneda: filters.moneda,
        });

        if (searchError) throw searchError;

        const rows = (matches ?? []) as MatchRow[];
        const cards = await buildCards(client, rows, supabaseUrl);
        const searchMs = Date.now() - searchStartedAt;

        const embeddingExpiresAt = canReuseEmbedding && cachedRow
            ? cachedRow.embedding_expires_at
            : new Date(now + EMBEDDING_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

        const { error: upsertError } = await client
            .from('semantic_search_cache')
            .upsert({
                query_hash: queryHash,
                query_text: parsed.query,
                normalized_query: normalizedQuery,
                filters: { ...filters, detected: detectedWithBudget },
                model: EMBEDDING_MODEL,
                dimensions: EMBEDDING_DIMENSIONS,
                query_embedding: vector,
                result_ids: cards.map(card => card.id),
                result_payload: cards,
                result_count: cards.length,
                data_version: dataVersion,
                hits: Number(cachedRow?.hits ?? 0),
                last_hit_at: new Date(now).toISOString(),
                embedding_expires_at: embeddingExpiresAt,
                results_expires_at: new Date(now + RESULTS_TTL_HOURS * 60 * 60 * 1000).toISOString(),
            }, { onConflict: 'query_hash' });

        if (upsertError) {
            logError('cache_write_failed', upsertError, { query_hash: queryHash, q: shortQuery(normalizedQuery) });
        }

        const cacheMode = canReuseEmbedding ? 'reused-embedding' : 'fresh';
        const totalMs = Date.now() - startedAt;

        logInfo('search', {
            status: 200,
            cache: cacheMode,
            q: shortQuery(normalizedQuery),
            zona: zoneLabel(detectedWithBudget),
            count: cards.length,
            ms: totalMs,
            cache_ms: cacheMs,
            catalog_ms: catalogMs,
            embedding_ms: embeddingMs,
            search_ms: searchMs,
            precio_min: filters.precio_min,
            precio_max: filters.precio_max,
            tipo: filters.tipo,
            operacion: filters.operacion,
            moneda: filters.moneda,
            gemini: canReuseEmbedding ? 0 : 1,
        });

        return jsonResponse({
            ok: true,
            cached: false,
            cache: cacheMode,
            query: parsed.query,
            normalized_query: normalizedQuery,
            filters,
            detected: detectedWithBudget,
            count: cards.length,
            results: cards,
            model: EMBEDDING_MODEL,
            dimensions: EMBEDDING_DIMENSIONS,
            timings: {
                total_ms: totalMs,
                cache_ms: cacheMs,
                catalog_ms: catalogMs,
                embedding_ms: embeddingMs,
                search_ms: searchMs,
            },
        });
    } catch (error) {
        logError('search_failed', error, { status: 500, ms: Date.now() - startedAt });
        return jsonResponse(
            { error: error instanceof Error ? error.message : 'No se pudo completar la búsqueda.' },
            500
        );
    }
});
