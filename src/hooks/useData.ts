import { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import type { Inmueble } from '../types/database.types';
import { getImageUrl } from '../utils/helpers';

type ImagenRow = { url_storage: string; orden?: number | null };
type InmuebleRow = Inmueble & { portadaUrl?: string } & { imagenes?: ImagenRow[] };

export const useInmuebles = (page: number, filters: Record<string, string>) => {
    const [inmuebles, setInmuebles] = useState<InmuebleRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [total, setTotal] = useState(0);

    const PAGE_SIZE = 6;

    const serializedFilters = JSON.stringify(filters);

    useEffect(() => {
        const fetchInmuebles = async () => {
            const activeFilters = JSON.parse(serializedFilters);

            setLoading(true);

            // Se piden siempre desde la primera página hasta la actual: así, al
            // volver atrás con una página guardada, el listado queda completo y
            // la operación es idempotente (StrictMode ejecuta el efecto dos veces).
            const to = (page + 1) * PAGE_SIZE - 1;

            const selectQuery = `*, barrios!inner(nombre, ciudad_id, ciudades!inner(nombre, departamento_id, departamentos!inner(nombre))), imagenes(url_storage, orden)`;
            // Se excluyen las vencidas al instante, sin esperar al cron que
            // actualiza el estado (que corre cada 5 minutos).
            const ahoraISO = new Date().toISOString();
            let query = supabase
                .from('inmuebles')
                .select(selectQuery, { count: 'exact' })
                .eq('estado', 'Disponible')
                .is('deleted_at', null)
                .or(`expira_at.is.null,expira_at.gt.${ahoraISO}`);

            if (activeFilters.departamento) {
                query = query.eq('barrios.ciudades.departamento_id', activeFilters.departamento);
            }
            if (activeFilters.ciudad) {
                query = query.eq('barrios.ciudad_id', activeFilters.ciudad);
            }
            if (activeFilters.barrio_id) {
                query = query.eq('barrio_id', activeFilters.barrio_id);
            } else if (activeFilters.barrio_search) {
                query = query.ilike('barrios.nombre', `%${activeFilters.barrio_search}%`);
            }

            if (activeFilters.tipo_propiedad) {
                query = query.eq('tipo_propiedad', activeFilters.tipo_propiedad);
            }

            // Venta y alquiler nunca se mezclan. Sin filtro explícito se muestra
            // venta, que es la operación por defecto de la portada.
            const operacionActiva = activeFilters.operacion === 'Alquiler' ? 'Alquiler' : 'Venta';
            query = query.eq('operacion', operacionActiva);

            if (activeFilters.precio_min || activeFilters.precio_max) {
                const moneda = operacionActiva === 'Alquiler' ? 'Bs' : 'USD';
                query = query.eq('moneda', moneda);
            }

            if (activeFilters.precio_min) {
                query = query.gte('precio', Number(activeFilters.precio_min));
            }
            if (activeFilters.precio_max) {
                query = query.lte('precio', Number(activeFilters.precio_max));
            }

            query = query.range(0, to)
                .order('destacado', { ascending: false })
                .order('publicado_at', { ascending: false });

            const { data, error, count } = await query;

            if (error) {
                console.error('Error fetching properties', error);
            } else if (data) {
                const formatted = ((data as Array<Record<string, unknown> & { imagenes?: ImagenRow[] }>).map((item) => {
                    const imgs = (item.imagenes || []).slice().sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
                    return {
                        ...item,
                        imagenes: imgs,
                        portadaUrl: imgs[0]?.url_storage ? getImageUrl(imgs[0].url_storage) : undefined
                    };
                })) as unknown as InmuebleRow[];
                // La lista se reemplaza completa (0..to), sin duplicar al re-ejecutar.
                setInmuebles(formatted);

                if (count !== null) {
                    setTotal(count);
                }
            }
            setLoading(false);
        };

        fetchInmuebles();
    }, [page, serializedFilters]);

    return { inmuebles, loading, total, totalPages: Math.ceil(total / PAGE_SIZE) };
};

export const useLocationCombos = () => {
    const [departamentos, setDepartamentos] = useState<any[]>([]);
    const [ciudades, setCiudades] = useState<any[]>([]);

    useEffect(() => {
        supabase.from('departamentos').select('*').then(({ data }) => setDepartamentos(data || []));
    }, []);

    const getCiudadesByDepto = async (deptoId: string) => {
        const { data } = await supabase.from('ciudades').select('*').eq('departamento_id', deptoId);
        setCiudades(data || []);
    };

    return { departamentos, ciudades, getCiudadesByDepto };
};
