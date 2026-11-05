import { useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';

export type SimilarInmueble = {
    id: string;
    slug?: string | null;
    titulo: string;
    precio: number;
    moneda: string;
    tipo_propiedad?: string;
    operacion?: 'Venta' | 'Alquiler';
    barrio_nombre?: string | null;
    ciudad_nombre?: string | null;
    departamento_nombre?: string | null;
    imagen_path?: string | null;
};

export const useSimilarInmuebles = (inmuebleId?: string | null, limit = 3) => {
    const [result, setResult] = useState<{ id: string; items: SimilarInmueble[] }>({ id: '', items: [] });

    useEffect(() => {
        if (!inmuebleId) return;

        let cancelled = false;

        const fetchSimilares = async () => {
            const { data, error } = await supabase.rpc('match_nearby_inmuebles', {
                target_id: inmuebleId,
                match_limit: limit,
            });

            if (cancelled) return;
            setResult({ id: inmuebleId, items: !error && data ? (data as SimilarInmueble[]) : [] });
        };

        fetchSimilares();

        return () => {
            cancelled = true;
        };
    }, [inmuebleId, limit]);

    const similares = result.id === inmuebleId ? result.items : [];

    return { similares };
};
