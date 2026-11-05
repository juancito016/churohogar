/**
 * ADM-29 / ADM-28 — Estadísticas del catálogo y estado de la caché.
 * El panel no puede leer `semantic_search_cache` ni `storage.objects`, así que
 * todo pasa por las RPC `admin_*` protegidas con `is_admin()`.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';

export type AdminStats = {
    inmuebles: {
        activos: number;
        vendidos: number;
        alquilados: number;
        vencidos: number;
        papelera: number;
        total: number;
    };
    /** Cuántos inmuebles (sin contar la papelera) son de venta y cuántos de alquiler. */
    operacion?: { venta: number; alquiler: number };
    imagenes: number;
    storage: { archivos: number; bytes: number };
    ubicaciones: { departamentos: number; ciudades: number; barrios: number };
    embeddings: { conVector: number; total: number };
};

export type CacheStats = {
    total: number;
    vigentes: number;
    expiradas: number;
    hits: number;
    consultasConHit: number;
    bytesAproximados: number;
    ultimaConsulta: string | null;
    ultimaCreacion: string | null;
    dataVersion: number;
    metaActualizadoAt: string | null;
};

const readError = (error: unknown, fallback: string) => {
    if (error && typeof error === 'object' && 'message' in error) {
        const message = String((error as { message: unknown }).message);
        if (message) return message;
    }
    return fallback;
};

type AdminSystemOptions = {
    estadisticas?: boolean;
    cache?: boolean;
};

export const useAdminSystem = ({ estadisticas = true, cache: verCache = true }: AdminSystemOptions = {}) => {
    const [stats, setStats] = useState<AdminStats | null>(null);
    const [cache, setCache] = useState<CacheStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [purging, setPurging] = useState(false);

    const refresh = useCallback(async () => {
        if (!estadisticas && !verCache) return;

        setLoading(true);
        setError(null);

        let statsData: AdminStats | null = null;
        let cacheData: CacheStats | null = null;
        let primerError: unknown = null;

        if (estadisticas) {
            const resultado = await supabase.rpc('admin_stats');
            if (resultado.error) primerError = resultado.error;
            else statsData = resultado.data as AdminStats;
        }

        if (verCache) {
            const resultado = await supabase.rpc('admin_cache_stats');
            if (resultado.error && !primerError) primerError = resultado.error;
            else if (!resultado.error) cacheData = resultado.data as CacheStats;
        }

        if (primerError) {
            setStats(null);
            setCache(null);
            setError(readError(primerError, 'No se pudieron cargar los datos del sistema.'));
        } else {
            setStats(statsData);
            setCache(cacheData);
        }

        setLoading(false);
    }, [estadisticas, verCache]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const purge = useCallback(
        async (soloExpiradas: boolean) => {
            setPurging(true);
            setError(null);

            try {
                const { data, error: purgeError } = await supabase.rpc('admin_purge_cache', {
                    solo_expiradas: soloExpiradas,
                });

                if (purgeError) {
                    throw new Error(readError(purgeError, 'No se pudo purgar la caché.'));
                }

                await refresh();
                return Number(data ?? 0);
            } finally {
                setPurging(false);
            }
        },
        [refresh]
    );

    return { stats, cache, loading, error, purging, refresh, purge };
};
