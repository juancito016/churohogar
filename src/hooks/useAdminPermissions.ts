import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';

/**
 * Permisos del administrador logueado.
 *
 * Si la RPC falla, `error` queda con mensaje y `permisos` en `[]`; el panel
 * decide entonces caer al comportamiento anterior para no quedarse en blanco.
 */
export const useAdminPermissions = (enabled: boolean) => {
    const [permisos, setPermisos] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const cargar = useCallback(async () => {
        if (!enabled) return;

        const { data, error: rpcError } = await supabase.rpc('admin_mis_permisos');

        if (rpcError) {
            setPermisos([]);
            setError(rpcError.message);
        } else {
            setPermisos(Array.isArray(data) ? (data as string[]) : []);
            setError(null);
        }

        setLoading(false);
    }, [enabled]);

    useEffect(() => {
        if (!enabled) return;

        // Carga inicial; la petición es asíncrona y gestiona su propio estado.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        cargar();
    }, [enabled, cargar]);

    const puede = useCallback(
        (clave: string) => permisos.includes(clave),
        [permisos]
    );

    return { permisos, loading, error, puede, recargar: cargar };
};
