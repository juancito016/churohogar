import { createClient } from 'npm:@supabase/supabase-js@2';
import { buildInmuebleText, type InmuebleTextSource } from '../_shared/build-inmueble-text.ts';
import {
    DEFAULT_RETRY_POLICY,
    isRetryableStatus,
    withRetry,
} from '../_shared/retry.ts';
import { logError, logInfo, logWarn } from '../_shared/log.ts';

const EMBEDDING_MODEL = 'gemini-embedding-2';
const EMBEDDING_DIMENSIONS = 768;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
/** Inmuebles por tanda: acota el tiempo de una invocación y deja reanudar. */
const DEFAULT_BATCH_SIZE = 5;
const MAX_BATCH_SIZE = 20;
/** Llamadas simultáneas a Gemini dentro de una tanda (su cuota es por minuto). */
const BATCH_CONCURRENCY = 2;
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent`;

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type InmuebleRow = InmuebleTextSource & { id: string; slug: string };

type SyncRequest = {
    inmueble_id?: string;
    inmueble_ids?: string[];
    limit?: number;
    offset?: number;
    batch_size?: number;
    force?: boolean;
    dry_run?: boolean;
};

type SyncResult = {
    inmueble_id: string;
    titulo: string;
    slug: string;
    status: 'ok' | 'skipped' | 'pending' | 'error';
    has_embedding: boolean;
    attempts?: number;
    error?: string;
};

type ExistingEmbedding = {
    inmueble_id: string;
    model: string;
    dimensions: number;
    content_hash: string;
};

const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
        },
    });

const requireEnv = (name: string) => {
    const value = Deno.env.get(name);
    if (!value) throw new Error(`Falta la variable de entorno ${name}.`);
    return value;
};

const sha256 = async (value: string) => {
    const data = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest))
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');
};

/** Error de Gemini que recuerda el código HTTP para decidir si se reintenta. */
class GeminiError extends Error {
    status: number;
    retryAfterMs?: number;

    constructor(message: string, status: number, retryAfterMs?: number) {
        super(message);
        this.name = 'GeminiError';
        this.status = status;
        this.retryAfterMs = retryAfterMs;
    }
}

const readRetryAfterMs = (response: Response) => {
    const header = response.headers.get('retry-after');
    if (!header) return undefined;

    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;

    const date = Date.parse(header);
    if (Number.isNaN(date)) return undefined;

    return Math.max(date - Date.now(), 0);
};

/** Una sola llamada a Gemini; los reintentos los pone `embedText`. */
const embedTextOnce = async (text: string, apiKey: string) => {
    const response = await fetch(GEMINI_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
            model: `models/${EMBEDDING_MODEL}`,
            content: {
                parts: [{ text }],
            },
            outputDimensionality: EMBEDDING_DIMENSIONS,
        }),
    });

    if (!response.ok) {
        const detail = await response.text();
        throw new GeminiError(
            `Gemini respondió ${response.status}: ${detail.slice(0, 300)}`,
            response.status,
            readRetryAfterMs(response)
        );
    }

    const payload = await response.json() as {
        embedding?: {
            values?: number[];
        };
    };

    const values = payload.embedding?.values;
    if (!Array.isArray(values) || values.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(`Gemini devolvió una dimensión inesperada: ${values?.length ?? 0}.`);
    }

    return values;
};

const isRetryableError = (error: unknown) => {
    if (error instanceof GeminiError) return isRetryableStatus(error.status);
    // Fallo de red/DNS: `fetch` lanza TypeError y merece otro intento.
    return error instanceof TypeError;
};

/**
 * Genera el vector con reintentos: la cuota de Gemini y sus 5xx son pasajeros,
 * así que un reindexado no se detiene por un fallo puntual.
 */
const embedText = async (text: string, apiKey: string) => {
    let attempts = 0;

    const values = await withRetry(
        async attempt => {
            attempts = attempt;
            return embedTextOnce(text, apiKey);
        },
        {
            policy: DEFAULT_RETRY_POLICY,
            isRetryable: isRetryableError,
            getRetryAfterMs: error => (error instanceof GeminiError ? error.retryAfterMs : undefined),
            onRetry: (error, attempt, delayMs) => {
                console.warn(
                    `sync-embeddings: reintento ${attempt} en ${delayMs} ms`,
                    error instanceof Error ? error.message : error
                );
            },
        }
    );

    return { values, attempts };
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isValidUuid = (value: unknown) => typeof value === 'string' && UUID_PATTERN.test(value.trim());

const readBody = async (request: Request): Promise<SyncRequest> => {
    const rawBody = await request.text();
    if (!rawBody.trim()) return {};

    const body = JSON.parse(rawBody) as SyncRequest;
    if (body.inmueble_id !== undefined && !isValidUuid(body.inmueble_id)) {
        throw new Error('inmueble_id debe ser un UUID válido.');
    }
    if (body.inmueble_ids !== undefined) {
        if (!Array.isArray(body.inmueble_ids)) {
            throw new Error('inmueble_ids debe ser un arreglo de UUID.');
        }
        if (body.inmueble_ids.length > MAX_LIMIT) {
            throw new Error(`inmueble_ids admite hasta ${MAX_LIMIT} elementos.`);
        }
        if (!body.inmueble_ids.every(isValidUuid)) {
            throw new Error('inmueble_ids contiene un UUID inválido.');
        }
    }
    if (body.limit !== undefined && (!Number.isInteger(body.limit) || body.limit < 1 || body.limit > MAX_LIMIT)) {
        throw new Error(`limit debe ser un entero entre 1 y ${MAX_LIMIT}.`);
    }
    if (
        body.offset !== undefined &&
        (!Number.isInteger(body.offset) || body.offset < 0 || body.offset > 10000)
    ) {
        throw new Error('offset debe ser un entero entre 0 y 10000.');
    }
    if (
        body.batch_size !== undefined &&
        (!Number.isInteger(body.batch_size) || body.batch_size < 1 || body.batch_size > MAX_BATCH_SIZE)
    ) {
        throw new Error(`batch_size debe ser un entero entre 1 y ${MAX_BATCH_SIZE}.`);
    }
    if (body.force !== undefined && typeof body.force !== 'boolean') {
        throw new Error('force debe ser true o false.');
    }
    if (body.dry_run !== undefined && typeof body.dry_run !== 'boolean') {
        throw new Error('dry_run debe ser true o false.');
    }

    return body;
};

const readJwtRole = (token: string) => {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    try {
        const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const padded = base64.padEnd(base64.length + (4 - base64.length % 4) % 4, '=');
        const payload = JSON.parse(atob(padded)) as { role?: string };
        return payload.role ?? null;
    } catch {
        return null;
    }
};

const authorize = async (
    request: Request,
    adminClient: ReturnType<typeof createClient>,
    serviceRoleKey: string
) => {
    const authorization = request.headers.get('Authorization') ?? '';
    const token = authorization.replace(/^Bearer\s+/i, '').trim();

    if (!token) return false;
    if (token === serviceRoleKey) return true;

    // La firma del token ya la validó el gateway (verify_jwt), así que el rol es fiable.
    if (readJwtRole(token) === 'service_role') return true;

    if (readJwtRole(token) !== 'authenticated') return false;

    const { data: userData, error: userError } = await adminClient.auth.getUser(token);
    if (userError || !userData.user) return false;

    const { data: adminRow, error: adminError } = await adminClient
        .from('admins')
        .select('user_id, activo')
        .eq('user_id', userData.user.id)
        .maybeSingle();

    if (adminError) throw adminError;
    // ADM-41: un administrador desactivado conserva su JWT hasta caducar,
    // así que el estado se comprueba en cada llamada.
    return Boolean(adminRow?.activo);
};

const selectInmuebles = async (
    adminClient: ReturnType<typeof createClient>,
    body: SyncRequest
) => {
    const limit = body.limit ?? DEFAULT_LIMIT;
    const offset = body.offset ?? 0;
    const targetIds = body.inmueble_ids?.filter(Boolean) ?? [];
    const targetId = body.inmueble_id?.trim();

    let query = adminClient
        .from('inmuebles')
        .select(`
            id,
            titulo,
            slug,
            descripcion,
            tipo_propiedad,
            operacion,
            precio,
            moneda,
            superficie_terreno,
            superficie_construida,
            habitaciones,
            banos,
            servicios,
            barrios!inner(
                nombre,
                ciudades!inner(
                    nombre,
                    departamentos!inner(nombre)
                )
            )
        `, { count: 'exact' })
        .is('deleted_at', null)
        .eq('estado', 'Disponible')
        .order('creado_at', { ascending: true })
        .order('id', { ascending: true })
        .range(offset, offset + limit - 1);

    if (targetIds.length > 0) {
        query = query.in('id', targetIds);
    } else if (targetId) {
        query = query.eq('id', targetId);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    return {
        inmuebles: (data ?? []) as unknown as InmuebleRow[],
        total: count ?? (data ?? []).length,
    };
};

const isUpToDate = (
    existing: ExistingEmbedding | undefined,
    contentHash: string
) =>
    Boolean(
        existing &&
        existing.model === EMBEDDING_MODEL &&
        existing.dimensions === EMBEDDING_DIMENSIONS &&
        existing.content_hash === contentHash
    );

const loadExistingEmbeddings = async (
    adminClient: ReturnType<typeof createClient>,
    inmuebleIds: string[]
) => {
    const existing = new Map<string, ExistingEmbedding>();
    if (inmuebleIds.length === 0) return existing;

    const { data, error } = await adminClient
        .from('inmueble_embeddings')
        .select('inmueble_id, model, dimensions, content_hash')
        .eq('model', EMBEDDING_MODEL)
        .in('inmueble_id', inmuebleIds);

    if (error) throw error;

    for (const row of (data ?? []) as ExistingEmbedding[]) {
        existing.set(row.inmueble_id, row);
    }

    return existing;
};

Deno.serve(async (request) => {
    if (request.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    if (request.method !== 'POST') {
        return jsonResponse({ error: 'Método no permitido.' }, 405);
    }

    try {
        const startedAt = Date.now();
        const supabaseUrl = requireEnv('SUPABASE_URL');
        const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
        const geminiApiKey = requireEnv('GEMINI_API_KEY');
        const adminClient = createClient(supabaseUrl, serviceRoleKey, {
            auth: { persistSession: false, autoRefreshToken: false },
        });

        const authorized = await authorize(request, adminClient, serviceRoleKey);
        if (!authorized) {
            logWarn('embedding_sync_rejected', { status: 401, reason: 'no_autorizado' });
            return jsonResponse({ error: 'No autorizado.' }, 401);
        }

        let body: SyncRequest;
        try {
            body = await readBody(request);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Cuerpo inválido.';
            logWarn('embedding_sync_rejected', { status: 400, reason: 'cuerpo_invalido', message });
            return jsonResponse({ error: message }, 400);
        }

        const { inmuebles, total } = await selectInmuebles(adminClient, body);
        const existingEmbeddings = await loadExistingEmbeddings(
            adminClient,
            inmuebles.map(inmueble => inmueble.id)
        );
        const dryRun = body.dry_run === true;
        const batchSize = Math.max(1, Math.min(body.batch_size ?? DEFAULT_BATCH_SIZE, MAX_BATCH_SIZE));
        const results: SyncResult[] = [];

        const processInmueble = async (inmueble: InmuebleRow): Promise<SyncResult> => {
            const existing = existingEmbeddings.get(inmueble.id);

            try {
                const contentText = buildInmuebleText(inmueble);
                if (!contentText) throw new Error('El texto del inmueble está vacío.');

                const contentHash = await sha256(contentText);
                const upToDate = !body.force && isUpToDate(existing, contentHash);

                if (dryRun) {
                    return {
                        inmueble_id: inmueble.id,
                        titulo: inmueble.titulo ?? '',
                        slug: inmueble.slug,
                        status: upToDate ? 'skipped' : 'pending',
                        has_embedding: Boolean(existing),
                    };
                }

                if (upToDate) {
                    return {
                        inmueble_id: inmueble.id,
                        titulo: inmueble.titulo ?? '',
                        slug: inmueble.slug,
                        status: 'skipped',
                        has_embedding: true,
                    };
                }

                const { values: embedding, attempts } = await embedText(contentText, geminiApiKey);

                const { error: upsertError } = await adminClient
                    .from('inmueble_embeddings')
                    .upsert({
                        inmueble_id: inmueble.id,
                        model: EMBEDDING_MODEL,
                        dimensions: EMBEDDING_DIMENSIONS,
                        content_hash: contentHash,
                        content_text: contentText,
                        embedding,
                    }, { onConflict: 'inmueble_id,model' });

                if (upsertError) throw upsertError;

                return {
                    inmueble_id: inmueble.id,
                    titulo: inmueble.titulo ?? '',
                    slug: inmueble.slug,
                    status: 'ok',
                    has_embedding: true,
                    ...(attempts > 1 ? { attempts } : {}),
                };
            } catch (error) {
                return {
                    inmueble_id: inmueble.id,
                    titulo: inmueble.titulo ?? '',
                    slug: inmueble.slug,
                    status: 'error',
                    has_embedding: Boolean(existing),
                    error: error instanceof Error ? error.message : String(error),
                };
            }
        };

        // Tandas secuenciales con concurrencia acotada: si Gemini limita la cuota,
        // el reindexado se detiene con un error claro y se puede reanudar.
        let batchCount = 0;
        for (let index = 0; index < inmuebles.length; index += batchSize) {
            const tanda = inmuebles.slice(index, index + batchSize);
            const parciales = new Array<SyncResult>(tanda.length);
            let cursor = 0;

            const worker = async () => {
                while (cursor < tanda.length) {
                    const posicion = cursor;
                    cursor += 1;
                    parciales[posicion] = await processInmueble(tanda[posicion]);
                }
            };

            await Promise.all(
                Array.from({ length: Math.min(BATCH_CONCURRENCY, tanda.length) }, () => worker())
            );

            results.push(...parciales);
            batchCount += 1;
        }

        const processed = results.filter(result => result.status === 'ok').length;
        const skipped = results.filter(result => result.status === 'skipped').length;
        const pending = results.filter(result => result.status === 'pending').length;
        const failed = results.filter(result => result.status === 'error').length;
        const retries = results.reduce((sum, result) => sum + Math.max((result.attempts ?? 1) - 1, 0), 0);
        const offset = body.offset ?? 0;
        const remaining = Math.max(total - offset - inmuebles.length, 0);
        const ms = Date.now() - startedAt;

        logInfo('embedding_sync', {
            status: 200,
            ok: failed === 0,
            dry_run: dryRun,
            requested: inmuebles.length,
            pending_total: total,
            processed,
            skipped,
            failed,
            retries,
            batches: dryRun ? 0 : batchCount,
            remaining,
            ms,
        });

        if (failed > 0) {
            logWarn('embedding_sync_failed_items', {
                failed,
                slugs: results.filter(result => result.status === 'error').map(result => result.slug).slice(0, 10),
            });
        }

        return jsonResponse({
            ok: failed === 0,
            model: EMBEDDING_MODEL,
            dimensions: EMBEDDING_DIMENSIONS,
            dry_run: dryRun,
            requested: inmuebles.length,
            pending_total: total,
            processed,
            skipped,
            pending,
            failed,
            retries,
            batch_size: batchSize,
            batches: dryRun ? 0 : batchCount,
            remaining,
            has_more: remaining > 0,
            results,
        });
    } catch (error) {
        logError('embedding_sync_failed', error, { status: 500 });
        return jsonResponse({
            error: error instanceof Error ? error.message : 'Error inesperado.',
        }, 500);
    }
});
