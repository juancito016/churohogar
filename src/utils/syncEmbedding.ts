/**
 * Sincronización del embedding de un inmueble.
 * La tabla `inmueble_embeddings` solo la escribe `service_role`, así que
 * el guardado desde el panel delega en la Edge Function `sync-embeddings`.
 */

import { supabase } from '../services/supabaseClient';

const FUNCTION_NAME = 'sync-embeddings';
const BATCH_SIZE = 50;

export type EmbeddingSyncOutcome = {
    synced: number;
    skipped: number;
    inactive: number;
    failed: number;
    message?: string;
};

type SyncResponse = {
    requested: number;
    processed: number;
    skipped: number;
    failed: number;
    results?: Array<{ status: string; error?: string }>;
};

const emptyOutcome = (): EmbeddingSyncOutcome => ({
    synced: 0,
    skipped: 0,
    inactive: 0,
    failed: 0,
});

export const readFunctionError = async (error: { message?: string; context?: unknown }) => {
    const fallback = error.message || 'No se pudo conectar con la sincronización.';
    const context = error.context as Response | undefined;

    if (!context || typeof context.json !== 'function') return fallback;

    try {
        const payload = await context.clone().json() as { error?: string };
        return payload?.error || fallback;
    } catch {
        return fallback;
    }
};

const syncBatch = async (ids: string[]): Promise<EmbeddingSyncOutcome> => {
    const body = ids.length === 1
        ? { inmueble_id: ids[0] }
        : { inmueble_ids: ids, limit: ids.length };

    const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, { body });

    if (error) {
        return { ...emptyOutcome(), failed: ids.length, message: await readFunctionError(error) };
    }

    const payload = data as SyncResponse | null;
    if (!payload) {
        return { ...emptyOutcome(), failed: ids.length, message: 'La sincronización no devolvió datos.' };
    }

    const failure = payload.results?.find(result => result.status === 'error');

    return {
        synced: payload.processed,
        skipped: payload.skipped,
        inactive: Math.max(ids.length - payload.requested, 0),
        failed: payload.failed,
        message: failure?.error,
    };
};

/**
 * Genera o refresca el vector de los inmuebles indicados.
 * Nunca lanza: el guardado del inmueble no debe fallar por un problema de embeddings.
 */
export const syncInmuebleEmbeddings = async (
    inmuebleIds: string | string[]
): Promise<EmbeddingSyncOutcome> => {
    const ids = Array.from(new Set((Array.isArray(inmuebleIds) ? inmuebleIds : [inmuebleIds]).filter(Boolean)));
    if (ids.length === 0) return emptyOutcome();

    const total = emptyOutcome();

    try {
        for (let index = 0; index < ids.length; index += BATCH_SIZE) {
            const batch = await syncBatch(ids.slice(index, index + BATCH_SIZE));
            total.synced += batch.synced;
            total.skipped += batch.skipped;
            total.inactive += batch.inactive;
            total.failed += batch.failed;
            if (!total.message && batch.message) total.message = batch.message;
        }
    } catch (error) {
        return {
            ...total,
            failed: total.failed + ids.length,
            message: error instanceof Error ? error.message : String(error),
        };
    }

    return total;
};
