import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '../services/supabaseClient';
import { getStoragePath } from '../utils/helpers';
import { syncInmuebleEmbeddings } from '../utils/syncEmbedding';
import { calcularExpiracion } from '../utils/publication';
import { mensajeError } from '../utils/errors';
import type { Inmueble, Imagen } from '../types/database.types';

export type VistaAdmin = 'activos' | 'vendidos' | 'alquilados' | 'vencidos' | 'papelera';

/** Días que se dan al revivir algo cuya publicación ya había caducado. */
const DIAS_AL_REACTIVAR = 30;
const TRES_DIAS_MS = 3 * 24 * 60 * 60 * 1000;

const expiracionPorDefecto = () => {
    const fecha = calcularExpiracion(DIAS_AL_REACTIVAR);
    return fecha ? fecha.toISOString() : null;
};

export const useAdminInmuebles = (
    page: number = 0,
    searchTerm: string = '',
    filterDepto: string = '',
    filterCiudad: string = '',
    view: VistaAdmin = 'activos',
    soloPorVencer: boolean = false,
    /** `Venta`, `Alquiler` o vacío (ambas). */
    filterOperacion: string = '',
    /** Si se indica, el listado se limita a los inmuebles de ese administrador. */
    soloPropiosId: string = ''
) => {
    const [inmuebles, setInmuebles] = useState<(Inmueble & { imagenes: Imagen[] })[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [total, setTotal] = useState(0);
    /** Cuántos activos vencen en los próximos 3 días (para el aviso del panel). */
    const [porVencer, setPorVencer] = useState(0);

    const PAGE_SIZE = 10;

    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(searchTerm);

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedSearchTerm(searchTerm);
        }, 500); // 500ms debounce
        return () => clearTimeout(handler);
    }, [searchTerm]);

    /** Contador para descartar respuestas que llegan tarde. */
    const ultimaPeticion = useRef(0);

    // Leer inmuebles (paginado y filtrado en servidor)
    const fetchInmuebles = useCallback(async () => {
        // Si se cambia de pestaña mientras carga, la respuesta vieja no debe
        // pisar la nueva: solo se aplica la última petición lanzada.
        const peticion = ++ultimaPeticion.current;
        setLoading(true);
        setError(null);

        const from = page * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;

        const selectQuery = '*, imagenes(*), barrios!inner(nombre, ciudad_id, ciudades!inner(departamento_id))';
        let query = supabase
            .from('inmuebles')
            .select(selectQuery, { count: 'exact' });

        if (debouncedSearchTerm) {
            query = query.ilike('titulo', `%${debouncedSearchTerm}%`);
        }
        if (filterDepto) {
            query = query.eq('barrios.ciudades.departamento_id', filterDepto);
        }
        if (filterCiudad) {
            query = query.eq('barrios.ciudad_id', filterCiudad);
        }
        if (filterOperacion) {
            query = query.eq('operacion', filterOperacion);
        }
        if (soloPropiosId) {
            query = query.eq('admin_id', soloPropiosId);
        }
        if (view === 'papelera') {
            query = query.not('deleted_at', 'is', null);
        } else {
            query = query.is('deleted_at', null);
        }

        if (view === 'activos') {
            query = query.eq('estado', 'Disponible');
        }
        if (view === 'vendidos') {
            query = query.eq('estado', 'Vendido');
        }
        if (view === 'alquilados') {
            query = query.eq('estado', 'Alquilado');
        }
        if (view === 'vencidos') {
            query = query.eq('estado', 'Vencido');
        }

        // "Por vencer": activos que caducan en los próximos 3 días.
        if (soloPorVencer && view === 'activos') {
            const ahora = new Date();
            query = query
                .gte('expira_at', ahora.toISOString())
                .lte('expira_at', new Date(ahora.getTime() + TRES_DIAS_MS).toISOString());
        }

        query = query.range(from, to).order('creado_at', { ascending: false });

        const { data, error, count } = await query;

        // Llegó tarde: ya hay una petición más reciente en curso.
        if (peticion !== ultimaPeticion.current) return;

        if (error) {
            setInmuebles([]);
            setError(mensajeError(error, 'No se pudieron cargar los inmuebles. Revisa tu conexión y reintenta.'));
        } else if (data) {
            setInmuebles(data as any[]);
        }
        if (count !== null) {
            setTotal(count);
        }

        const ahoraISO = new Date().toISOString();
        const limiteISO = new Date(Date.now() + TRES_DIAS_MS).toISOString();
        let porVencerQuery = supabase
            .from('inmuebles')
            .select('id', { count: 'exact', head: true })
            .eq('estado', 'Disponible')
            .is('deleted_at', null)
            .gte('expira_at', ahoraISO)
            .lte('expira_at', limiteISO);

        if (soloPropiosId) {
            porVencerQuery = porVencerQuery.eq('admin_id', soloPropiosId);
        }

        const { count: countPorVencer } = await porVencerQuery;

        if (peticion !== ultimaPeticion.current) return;

        setPorVencer(countPorVencer ?? 0);
        setLoading(false);
    }, [page, debouncedSearchTerm, filterDepto, filterCiudad, view, soloPorVencer, filterOperacion, soloPropiosId]);

    useEffect(() => {
        fetchInmuebles();
    }, [fetchInmuebles]);

    const invalidatePublicCache = () => {
        Object.keys(sessionStorage)
            .filter(key => key.startsWith('inmuebles_'))
            .forEach(key => sessionStorage.removeItem(key));
    };

    /**
     * Al reactivar o restaurar algo cuya publicación ya caducó, se le da un
     * período nuevo: si no, volvería a desaparecer en menos de 5 minutos.
     * Las publicaciones permanentes (`expira_at` null) no se tocan.
     */
    const revivirSiCaduco = async (ids: string[]) => {
        if (ids.length === 0) return;
        const nuevaExpiracion = expiracionPorDefecto();
        if (!nuevaExpiracion) return;

        const { error } = await supabase
            .from('inmuebles')
            .update({ expira_at: nuevaExpiracion, publicado_at: new Date().toISOString() })
            .in('id', ids)
            .not('expira_at', 'is', null)
            .lt('expira_at', new Date().toISOString());

        if (error) throw error;
    };

    // Marcar o quitar "Destacado" (solo afecta el orden del listado, no el estado).
    const toggleDestacado = async (id: string, actual: boolean) => {
        const { error } = await supabase
            .from('inmuebles')
            .update({ destacado: !actual })
            .eq('id', id);

        if (error) throw error;

        invalidatePublicCache();
        await fetchInmuebles();
        return !actual;
    };

    // Cambiar estado Disponible <-> Vendido / Alquilado
    const toggleEstado = async (
        id: string,
        estadoActual: 'Disponible' | 'Vendido' | 'Alquilado' | 'Vencido',
        operacion: 'Venta' | 'Alquiler' = 'Venta'
    ) => {
        // Un alquiler no se vende: al cerrarlo queda "Alquilado".
        const nuevoEstado = estadoActual === 'Disponible'
            ? (operacion === 'Alquiler' ? 'Alquilado' : 'Vendido')
            : 'Disponible';
        const payload: Record<string, unknown> = { estado: nuevoEstado };
        if (nuevoEstado === 'Disponible') {
            payload.publicado_at = new Date().toISOString();
        }

        const { error } = await supabase
            .from('inmuebles')
            .update(payload)
            .eq('id', id);

        if (error) throw error;

        if (nuevoEstado === 'Disponible') {
            await revivirSiCaduco([id]);
            void syncInmuebleEmbeddings(id);
        }

        invalidatePublicCache();
        await fetchInmuebles();
        return nuevoEstado;
    };

    /**
     * Renueva una publicación y la devuelve a Disponible.
     * `dias = null` la deja permanente. Lo hace el RPC para que la fecha se
     * calcule en la base y no dependa del reloj del navegador.
     */
    const renovarPublicaciones = async (ids: string[], dias: number | null) => {
        if (ids.length === 0) return 0;

        const { data, error } = await supabase.rpc('renew_publications', {
            target_ids: ids,
            dias,
        });

        if (error) throw error;

        void syncInmuebleEmbeddings(ids);
        invalidatePublicCache();
        await fetchInmuebles();
        return (data as number | null) ?? 0;
    };

    // Mover a la papelera sin borrar la fila ni las imágenes
    const moverAPapelera = async (id: string) => {
        const { error } = await supabase
            .from('inmuebles')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', id);

        if (error) throw error;

        invalidatePublicCache();
        setInmuebles(prev => prev.filter(item => item.id !== id));
        fetchInmuebles();
    };

    // Restaurar un inmueble desde la papelera
    const restaurarInmueble = async (id: string) => {
        const { error } = await supabase
            .from('inmuebles')
            .update({ deleted_at: null })
            .eq('id', id);

        if (error) throw error;

        await revivirSiCaduco([id]);
        void syncInmuebleEmbeddings(id);

        invalidatePublicCache();
        setInmuebles(prev => prev.filter(item => item.id !== id));
        fetchInmuebles();
    };

    // Eliminar definitivamente el inmueble y sus archivos de Storage
    const eliminarDefinitivamente = async (id: string) => {
        const { data: imagenes, error: imagenesError } = await supabase
            .from('imagenes')
            .select('url_storage')
            .eq('inmueble_id', id);

        if (imagenesError) throw imagenesError;

        const { error } = await supabase
            .from('inmuebles')
            .delete()
            .eq('id', id);

        if (error) throw error;

        const paths = (imagenes || [])
            .map(img => getStoragePath(img.url_storage))
            .filter(Boolean);

        if (paths.length > 0) {
            const { error: storageError } = await supabase.storage
                .from('fotos-inmuebles')
                .remove(paths);

            if (storageError) {
                console.warn('Inmueble eliminado; quedaron fotos en Storage para limpiar.', storageError);
            }
        }

        invalidatePublicCache();
        setInmuebles(prev => prev.filter(item => item.id !== id));
        fetchInmuebles();
    };

    const cambiarEstadoMasivo = async (ids: string[], estado: 'Disponible' | 'Vendido' | 'Alquilado') => {
        if (ids.length === 0) return 0;

        const payload: Record<string, unknown> = { estado };
        if (estado === 'Disponible') {
            payload.publicado_at = new Date().toISOString();
        }

        const { data, error } = await supabase
            .from('inmuebles')
            .update(payload)
            .in('id', ids)
            .is('deleted_at', null)
            .select('id');

        if (error) throw error;

        if (estado === 'Disponible') {
            const tocados = (data ?? []).map(item => item.id);
            await revivirSiCaduco(tocados);
            void syncInmuebleEmbeddings(tocados);
        }

        invalidatePublicCache();
        setInmuebles(prev => prev.map(item => ids.includes(item.id) ? { ...item, estado } : item));
        await fetchInmuebles();
        return data?.length ?? 0;
    };

    const moverAPapeleraMasivo = async (ids: string[]) => {
        if (ids.length === 0) return 0;

        const { data, error } = await supabase
            .from('inmuebles')
            .update({ deleted_at: new Date().toISOString() })
            .in('id', ids)
            .is('deleted_at', null)
            .select('id');

        if (error) throw error;

        invalidatePublicCache();
        setInmuebles(prev => prev.filter(item => !ids.includes(item.id)));
        await fetchInmuebles();
        return data?.length ?? 0;
    };

    const restaurarMasivo = async (ids: string[]) => {
        if (ids.length === 0) return 0;

        const { data, error } = await supabase
            .from('inmuebles')
            .update({ deleted_at: null })
            .in('id', ids)
            .not('deleted_at', 'is', null)
            .select('id');

        if (error) throw error;

        const restaurados = (data ?? []).map(item => item.id);
        await revivirSiCaduco(restaurados);
        void syncInmuebleEmbeddings(restaurados);

        invalidatePublicCache();
        setInmuebles(prev => prev.filter(item => !ids.includes(item.id)));
        await fetchInmuebles();
        return data?.length ?? 0;
    };

    const eliminarDefinitivamenteMasivo = async (ids: string[]) => {
        if (ids.length === 0) return 0;

        const { data: imagenes, error: imagenesError } = await supabase
            .from('imagenes')
            .select('inmueble_id, url_storage')
            .in('inmueble_id', ids);

        if (imagenesError) throw imagenesError;

        const { data, error } = await supabase
            .from('inmuebles')
            .delete()
            .in('id', ids)
            .not('deleted_at', 'is', null)
            .select('id');

        if (error) throw error;

        const deletedIds = new Set((data || []).map(item => item.id));
        const paths = (imagenes || [])
            .filter(img => deletedIds.has(img.inmueble_id))
            .map(img => getStoragePath(img.url_storage))
            .filter(Boolean);

        if (paths.length > 0) {
            const { error: storageError } = await supabase.storage
                .from('fotos-inmuebles')
                .remove(paths);

            if (storageError) {
                console.warn('Inmuebles eliminados; quedaron fotos en Storage para limpiar.', storageError);
            }
        }

        invalidatePublicCache();
        setInmuebles(prev => prev.filter(item => !deletedIds.has(item.id)));
        await fetchInmuebles();
        return deletedIds.size;
    };

    return {
        inmuebles,
        loading,
        error,
        total,
        porVencer,
        totalPages: Math.ceil(total / PAGE_SIZE),
        page,
        fetchInmuebles,
        toggleEstado,
        toggleDestacado,
        renovarPublicaciones,
        moverAPapelera,
        restaurarInmueble,
        eliminarDefinitivamente,
        cambiarEstadoMasivo,
        moverAPapeleraMasivo,
        restaurarMasivo,
        eliminarDefinitivamenteMasivo
    };
};
