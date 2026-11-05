/**
 * Estado y sincronización de los embeddings del catálogo.
 * La tabla `inmueble_embeddings` solo es accesible con `service_role`,
 * así que todo pasa por la Edge Function `sync-embeddings`.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { readFunctionError } from '../utils/syncEmbedding';

const FUNCTION_NAME = 'sync-embeddings';
const BATCH_LIMIT = 100;
/** Tope de páginas por clic para que un catálogo enorme no cuelgue el panel. */
const MAX_PAGES = 20;
const LAST_RUN_KEY = 'churo:embeddings-last-run';

export type EmbeddingSyncResult = {
    inmueble_id: string;
    titulo: string;
    slug: string;
    status: 'ok' | 'skipped' | 'pending' | 'error';
    has_embedding: boolean;
    error?: string;
};

type EmbeddingSyncResponse = {
    ok: boolean;
    dry_run: boolean;
    model: string;
    dimensions: number;
    requested: number;
    pending_total: number;
    processed: number;
    skipped: number;
    pending: number;
    failed: number;
    retries: number;
    batch_size: number;
    batches: number;
    remaining: number;
    has_more: boolean;
    results: EmbeddingSyncResult[];
};

export type EmbeddingStats = {
    total: number;
    conVector: number;
    sinVector: number;
    desactualizados: number;
    errores: number;
    truncated: boolean;
};

export type EmbeddingRun = {
    finishedAt: number;
    processed: number;
    skipped: number;
    failed: number;
    retries?: number;
    pages?: number;
};

const readLastRun = (): EmbeddingRun | null => {
    try {
        const raw = localStorage.getItem(LAST_RUN_KEY);
        if (!raw) return null;

        const parsed = JSON.parse(raw) as Partial<EmbeddingRun>;
        if (typeof parsed.finishedAt !== 'number') return null;

        return {
            finishedAt: parsed.finishedAt,
            processed: typeof parsed.processed === 'number' ? parsed.processed : 0,
            skipped: typeof parsed.skipped === 'number' ? parsed.skipped : 0,
            failed: typeof parsed.failed === 'number' ? parsed.failed : 0,
            retries: typeof parsed.retries === 'number' ? parsed.retries : 0,
            pages: typeof parsed.pages === 'number' ? parsed.pages : 1,
        };
    } catch {
        return null;
    }
};

const writeLastRun = (run: EmbeddingRun) => {
    try {
        localStorage.setItem(LAST_RUN_KEY, JSON.stringify(run));
    } catch {
        return;
    }
};

const invokeSync = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, { body });

    if (error) throw new Error(await readFunctionError(error));

    return data as EmbeddingSyncResponse;
};

export const useAdminEmbeddings = () => {
    const [stats, setStats] = useState<EmbeddingStats | null>(null);
    const [pendientes, setPendientes] = useState<EmbeddingSyncResult[]>([]);
    const [loading, setLoading] = useState(true);
    const [running, setRunning] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [lastRun, setLastRun] = useState<EmbeddingRun | null>(readLastRun);

    const loadStats = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const data = await invokeSync({ dry_run: true, limit: BATCH_LIMIT });
            const results = data.results ?? [];
            const pendingResults = results.filter(result => result.status === 'pending');

            setPendientes(pendingResults);
            setStats({
                total: data.requested,
                conVector: results.filter(result => result.status === 'skipped').length,
                sinVector: pendingResults.filter(result => !result.has_embedding).length,
                desactualizados: pendingResults.filter(result => result.has_embedding).length,
                errores: results.filter(result => result.status === 'error').length,
                truncated: data.requested >= BATCH_LIMIT,
            });
        } catch (loadError) {
            setStats(null);
            setPendientes([]);
            setError(loadError instanceof Error ? loadError.message : 'Error al leer el estado.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadStats();
    }, [loadStats]);

    const runSync = async (body: Record<string, unknown>, key: string, followPages = false) => {
        setRunning(key);
        setError(null);

        try {
            const totals = { processed: 0, skipped: 0, failed: 0, retries: 0 };
            let offset = Number(body.offset ?? 0);
            let pages = 0;
            let last: EmbeddingSyncResponse | null = null;

            // Catálogos grandes: la función devuelve `has_more` y aquí se piden las
            // páginas siguientes, así un solo clic termina todo el pendiente.
            do {
                const data = await invokeSync({ ...body, offset });
                pages += 1;
                last = data;
                totals.processed += data.processed;
                totals.skipped += data.skipped;
                totals.failed += data.failed;
                totals.retries += data.retries ?? 0;

                if (!followPages || !data.has_more || data.requested === 0) break;
                offset += data.requested;
            } while (pages < MAX_PAGES);

            const run: EmbeddingRun = {
                finishedAt: Date.now(),
                ...totals,
                pages,
            };

            setLastRun(run);
            writeLastRun(run);
            await loadStats();

            return last as EmbeddingSyncResponse;
        } catch (runError) {
            const message = runError instanceof Error ? runError.message : 'Error al sincronizar.';
            setError(message);
            throw new Error(message);
        } finally {
            setRunning(null);
        }
    };

    const reindexAll = () => runSync({ limit: BATCH_LIMIT }, 'todos', true);

    const reindexOne = (inmuebleId: string) => runSync({ inmueble_id: inmuebleId }, inmuebleId);

    return {
        stats,
        pendientes,
        loading,
        running,
        error,
        lastRun,
        refresh: loadStats,
        reindexAll,
        reindexOne,
    };
};
