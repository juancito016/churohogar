/**
 * ADM-30 — Configuración del negocio.
 * WhatsApp por defecto, mensaje inicial y textos de SEO viven en la fila única
 * `configuracion_negocio`. Se cachean en memoria durante 5 minutos para no
 * repetir la lectura en cada ficha ni en la portada.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';

export type BusinessConfig = {
    whatsapp: string;
    mensajeWhatsapp: string;
    seoTitulo: string;
    seoDescripcion: string;
    actualizadoAt: string | null;
};

export const DEFAULT_BUSINESS_CONFIG: BusinessConfig = {
    whatsapp: '59164303730',
    mensajeWhatsapp: '¡Hola ChuroHogar! Me interesa este inmueble:',
    seoTitulo: 'Casas en Tarija | Venta de Inmuebles y Terrenos | Churo Hogar',
    seoDescripcion:
        'La mejor plataforma inmobiliaria para encontrar, comprar o vender tu casa, departamento o terreno ideal en Tarija y toda Bolivia.',
    actualizadoAt: null,
};

const CACHE_TTL = 5 * 60 * 1000;

let cachedConfig: BusinessConfig | null = null;
let cachedAt = 0;
let inflight: Promise<BusinessConfig> | null = null;

type ConfigRow = {
    whatsapp: string;
    mensaje_whatsapp: string;
    seo_titulo: string;
    seo_descripcion: string;
    actualizado_at: string | null;
};

const mapRow = (row: ConfigRow): BusinessConfig => ({
    whatsapp: row.whatsapp,
    mensajeWhatsapp: row.mensaje_whatsapp,
    seoTitulo: row.seo_titulo,
    seoDescripcion: row.seo_descripcion,
    actualizadoAt: row.actualizado_at,
});

export const invalidateBusinessConfig = () => {
    cachedConfig = null;
    cachedAt = 0;
};

export const fetchBusinessConfig = async (force = false): Promise<BusinessConfig> => {
    if (!force && cachedConfig && Date.now() - cachedAt < CACHE_TTL) {
        return cachedConfig;
    }

    if (!force && inflight) return inflight;

    inflight = (async () => {
        const { data, error } = await supabase
            .from('configuracion_negocio')
            .select('whatsapp, mensaje_whatsapp, seo_titulo, seo_descripcion, actualizado_at')
            .eq('id', true)
            .maybeSingle();

        if (error) {
            throw new Error('No se pudo leer la configuración del negocio.');
        }

        if (!data) return DEFAULT_BUSINESS_CONFIG;

        const config = mapRow(data as ConfigRow);
        cachedConfig = config;
        cachedAt = Date.now();
        return config;
    })();

    try {
        return await inflight;
    } finally {
        inflight = null;
    }
};

export const useBusinessConfig = () => {
    const [config, setConfig] = useState<BusinessConfig>(cachedConfig ?? DEFAULT_BUSINESS_CONFIG);
    const [loading, setLoading] = useState(!cachedConfig);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async (force = false) => {
        setLoading(true);
        setError(null);

        try {
            setConfig(await fetchBusinessConfig(force));
        } catch (loadError) {
            setError(
                loadError instanceof Error
                    ? loadError.message
                    : 'No se pudo leer la configuración del negocio.'
            );
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    return { config, loading, error, refresh: () => load(true) };
};
