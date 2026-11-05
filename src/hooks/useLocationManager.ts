import { useState, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';

export interface UbicacionDepartamento {
    id: string;
    nombre: string;
}

export interface UbicacionCiudad {
    id: string;
    nombre: string;
    departamento_id: string;
    departamentos?: { nombre: string | null } | null;
}

export interface UbicacionBarrio {
    id: string;
    nombre: string;
    ciudad_id: string;
}

export interface BarrioConInmuebles extends UbicacionBarrio {
    inmuebles: number;
}

/**
 * Normaliza un nombre de ubicación igual que la base de datos
 * (`public.normalize_nombre`): minúsculas, sin tildes y con espacios simples.
 * Sirve para detectar duplicados antes de enviar el insert y para mostrar un
 * mensaje claro cuando el índice único los bloquea.
 */
export const normalizeLocationName = (valor: string) =>
    (valor ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();

/** Deja el nombre listo para guardar: sin extremos y con espacios simples. */
export const formatLocationName = (valor: string) =>
    (valor ?? '').replace(/\s+/g, ' ').trim();

const esDuplicado = (error: unknown) => (error as { code?: string } | null)?.code === '23505';

export const useLocationManager = () => {
    const [departamentos, setDepartamentos] = useState<UbicacionDepartamento[]>([]);
    const [ciudades, setCiudades] = useState<UbicacionCiudad[]>([]);
    const [loadingLocations, setLoadingLocations] = useState(false);
    const [isLoadingCiudades, setIsLoadingCiudades] = useState(false);
    const [errorCiudades, setErrorCiudades] = useState<unknown>(null);

    // Fetch Departamentos
    const fetchDepartamentos = useCallback(async () => {
        setLoadingLocations(true);
        const { data, error } = await supabase.from('departamentos').select('*').order('nombre');
        if (!error && data) setDepartamentos(data);
        setLoadingLocations(false);
    }, []);

    // Fetch Ciudades
    const fetchCiudades = useCallback(async () => {
        setLoadingLocations(true);
        const { data, error } = await supabase.from('ciudades').select('*, departamentos(nombre)').order('nombre');
        if (!error && data) setCiudades(data);
        setLoadingLocations(false);
    }, []);

    // Obtener ciudades filtradas por departamento (uso en UI para mejorar UX)
    const getCiudadesByDepto = useCallback(async (departamento_id: string) => {
        setIsLoadingCiudades(true);
        setErrorCiudades(null);
        setCiudades([]);
        const { data, error } = await supabase
            .from('ciudades')
            .select('id,nombre')
            .eq('departamento_id', departamento_id)
            .order('nombre');
        if (!error && data) setCiudades(data as UbicacionCiudad[]);
        if (error) setErrorCiudades(error);
        setIsLoadingCiudades(false);
        return { data, error };
    }, []);

    // Agregar Departamento
    const addDepartamento = async (nombre: string) => {
        const limpio = formatLocationName(nombre);
        if (!limpio) throw new Error('El nombre del departamento no puede estar vacío.');

        const { data, error } = await supabase.from('departamentos').insert({ nombre: limpio }).select().single();
        if (error) {
            if (esDuplicado(error)) throw new Error(`Ya existe un departamento llamado "${limpio}".`);
            throw error;
        }
        setDepartamentos(prev => [...prev, data]);
        return data;
    };

    // Renombrar Departamento
    const renameDepartamento = async (id: string, nombre: string) => {
        const limpio = formatLocationName(nombre);
        if (!limpio) throw new Error('El nombre del departamento no puede estar vacío.');

        const { data, error } = await supabase
            .from('departamentos')
            .update({ nombre: limpio })
            .eq('id', id)
            .select()
            .single();
        if (error) {
            if (esDuplicado(error)) throw new Error(`Ya existe un departamento llamado "${limpio}".`);
            throw error;
        }
        setDepartamentos(prev => prev.map(d => (d.id === id ? { ...d, ...data } : d)));
        return data;
    };

    const countInmueblesByBarrioIds = useCallback(async (barrioIds: string[]) => {
        if (barrioIds.length === 0) return 0;
        const { count, error } = await supabase
            .from('inmuebles')
            .select('id', { count: 'exact', head: true })
            .in('barrio_id', barrioIds);
        if (error) throw error;
        return count ?? 0;
    }, []);

    const countInmueblesByCiudad = useCallback(async (ciudadId: string) => {
        const { data, error } = await supabase.from('barrios').select('id').eq('ciudad_id', ciudadId);
        if (error) throw error;
        return countInmueblesByBarrioIds((data ?? []).map(b => b.id));
    }, [countInmueblesByBarrioIds]);

    const countInmueblesByDepartamento = useCallback(async (departamentoId: string) => {
        const { data: ciudadesDepto, error: ciudadesError } = await supabase
            .from('ciudades')
            .select('id')
            .eq('departamento_id', departamentoId);
        if (ciudadesError) throw ciudadesError;
        if (!ciudadesDepto?.length) return 0;

        const { data: barriosDepto, error: barriosError } = await supabase
            .from('barrios')
            .select('id')
            .in('ciudad_id', ciudadesDepto.map(c => c.id));
        if (barriosError) throw barriosError;
        return countInmueblesByBarrioIds((barriosDepto ?? []).map(b => b.id));
    }, [countInmueblesByBarrioIds]);

    // Eliminar Departamento solo si no tiene inmuebles
    const deleteDepartamento = async (id: string) => {
        const count = await countInmueblesByDepartamento(id);
        if (count > 0) {
            throw new Error(`No se puede eliminar el departamento: ${count} inmueble(s) dependen de él. Reasígnalos a otra ubicación primero.`);
        }
        const { error } = await supabase.from('departamentos').delete().eq('id', id);
        if (error) {
            if (error.code === '23503') throw new Error('No se puede eliminar el departamento: todavía tiene inmuebles asociados. Reasígnalos primero.');
            throw error;
        }
        setDepartamentos(prev => prev.filter(d => d.id !== id));
    };

    // Agregar Ciudad
    const addCiudad = async (nombre: string, departamento_id: string) => {
        const limpio = formatLocationName(nombre);
        if (!limpio) throw new Error('El nombre de la ciudad no puede estar vacío.');

        const { data, error } = await supabase
            .from('ciudades')
            .insert({ nombre: limpio, departamento_id })
            .select('*, departamentos(nombre)')
            .single();
        if (error) {
            if (esDuplicado(error)) throw new Error(`La ciudad "${limpio}" ya está registrada en este departamento.`);
            throw error;
        }
        setCiudades(prev => [...prev, data as UbicacionCiudad]);
        return data as UbicacionCiudad;
    };

    // Renombrar Ciudad
    const renameCiudad = async (id: string, nombre: string) => {
        const limpio = formatLocationName(nombre);
        if (!limpio) throw new Error('El nombre de la ciudad no puede estar vacío.');

        const { data, error } = await supabase
            .from('ciudades')
            .update({ nombre: limpio })
            .eq('id', id)
            .select('*, departamentos(nombre)')
            .single();
        if (error) {
            if (esDuplicado(error)) throw new Error(`Ya existe una ciudad llamada "${limpio}" en este departamento.`);
            throw error;
        }
        const ciudad = data as UbicacionCiudad;
        setCiudades(prev => prev.map(c => (c.id === id ? { ...c, ...ciudad } : c)));
        return ciudad;
    };

    // Eliminar Ciudad solo si no tiene inmuebles
    const deleteCiudad = async (id: string) => {
        const count = await countInmueblesByCiudad(id);
        if (count > 0) {
            throw new Error(`No se puede eliminar la ciudad: ${count} inmueble(s) dependen de ella. Reasígnalos a otra ubicación primero.`);
        }
        const { error } = await supabase.from('ciudades').delete().eq('id', id);
        if (error) {
            if (error.code === '23503') throw new Error('No se puede eliminar la ciudad: todavía tiene inmuebles asociados. Reasígnalos primero.');
            throw error;
        }
        setCiudades(prev => prev.filter(c => c.id !== id));
    };

    // Barrios de una ciudad, con cuántos inmuebles activos tiene cada uno
    const fetchBarrios = useCallback(async (ciudadId: string): Promise<BarrioConInmuebles[]> => {
        const { data, error } = await supabase
            .from('barrios')
            .select('id, nombre, ciudad_id')
            .eq('ciudad_id', ciudadId)
            .order('nombre');
        if (error) throw error;

        const barrios = (data ?? []) as UbicacionBarrio[];
        if (barrios.length === 0) return [];

        const { data: usos, error: usosError } = await supabase
            .from('inmuebles')
            .select('barrio_id')
            .is('deleted_at', null)
            .in('barrio_id', barrios.map(b => b.id));
        if (usosError) throw usosError;

        const conteo = new Map<string, number>();
        (usos ?? []).forEach(u => conteo.set(u.barrio_id, (conteo.get(u.barrio_id) ?? 0) + 1));

        return barrios.map(b => ({ ...b, inmuebles: conteo.get(b.id) ?? 0 }));
    }, []);

    // Agregar Barrio
    const addBarrio = async (nombre: string, ciudad_id: string) => {
        const limpio = formatLocationName(nombre);
        if (!limpio) throw new Error('El nombre del barrio no puede estar vacío.');
        if (!ciudad_id) throw new Error('Debes elegir una ciudad.');

        const { data, error } = await supabase
            .from('barrios')
            .insert({ nombre: limpio, ciudad_id })
            .select('id, nombre, ciudad_id')
            .single();
        if (error) {
            if (esDuplicado(error)) throw new Error(`Ya existe un barrio llamado "${limpio}" en esta ciudad.`);
            throw error;
        }
        return data as UbicacionBarrio;
    };

    // Renombrar Barrio
    const renameBarrio = async (id: string, nombre: string) => {
        const limpio = formatLocationName(nombre);
        if (!limpio) throw new Error('El nombre del barrio no puede estar vacío.');

        const { data, error } = await supabase
            .from('barrios')
            .update({ nombre: limpio })
            .eq('id', id)
            .select('id, nombre, ciudad_id')
            .single();
        if (error) {
            if (esDuplicado(error)) throw new Error(`Ya existe un barrio llamado "${limpio}" en esta ciudad.`);
            throw error;
        }
        return data as UbicacionBarrio;
    };

    // Eliminar Barrio solo si no tiene inmuebles
    const countInmueblesByBarrio = useCallback(async (barrioId: string) => {
        const { count, error } = await supabase
            .from('inmuebles')
            .select('id', { count: 'exact', head: true })
            .eq('barrio_id', barrioId)
            .is('deleted_at', null);
        if (error) throw error;
        return count ?? 0;
    }, []);

    const deleteBarrio = async (id: string) => {
        const count = await countInmueblesByBarrio(id);
        if (count > 0) {
            throw new Error(`No se puede eliminar el barrio: ${count} inmueble(s) dependen de él. Fusiónalo con otro barrio o reasígnalos primero.`);
        }
        const { error } = await supabase.from('barrios').delete().eq('id', id);
        if (error) {
            if (error.code === '23503') throw new Error('No se puede eliminar el barrio: todavía tiene inmuebles asociados.');
            throw error;
        }
    };

    /**
     * Fusiona dos barrios de la misma ciudad: mueve todos los inmuebles del
     * origen al destino y borra el origen. La transacción vive en la base
     * (`public.merge_barrios`), así que no puede quedar a medias.
     */
    const mergeBarrios = async (origen: string, destino: string) => {
        if (!origen || !destino) throw new Error('Debes elegir el barrio de origen y el de destino.');
        if (origen === destino) throw new Error('El barrio de origen y el de destino son el mismo.');

        const { data, error } = await supabase.rpc('merge_barrios', { origen, destino });
        if (error) {
            if (error.code === '42501') throw new Error('Solo un administrador puede fusionar barrios.');
            throw new Error(error.message || 'No se pudieron fusionar los barrios.');
        }
        return (data as number) ?? 0;
    };

    /**
     * Devuelve el ID del barrio existente o lo crea. La comparación ignora
     * tildes, mayúsculas y espacios extra, igual que el índice único de la
     * base. Si dos guardados simultáneos chocan, el error `23505` se resuelve
     * releyendo el barrio que ganó la carrera.
     */
    const getOrCreateBarrio = async (nombre: string, ciudad_id: string) => {
        const clave = normalizeLocationName(nombre);
        if (!clave || !ciudad_id) throw new Error('Falta nombre del barrio o ciudad');

        const buscarExistente = async () => {
            const { data, error } = await supabase
                .from('barrios')
                .select('id, nombre')
                .eq('ciudad_id', ciudad_id);
            if (error) throw error;
            return (data ?? []).find(b => normalizeLocationName(b.nombre) === clave)?.id ?? null;
        };

        const existente = await buscarExistente();
        if (existente) return existente;

        const { data, error } = await supabase
            .from('barrios')
            .insert({ nombre: formatLocationName(nombre), ciudad_id })
            .select('id')
            .single();

        if (error) {
            if (esDuplicado(error)) {
                const id = await buscarExistente();
                if (id) return id;
            }
            throw error;
        }

        return data.id;
    };

    return {
        departamentos,
        ciudades,
        loadingLocations,
        isLoadingCiudades,
        errorCiudades,
        fetchDepartamentos,
        fetchCiudades,
        getCiudadesByDepto,
        addDepartamento,
        renameDepartamento,
        deleteDepartamento,
        addCiudad,
        renameCiudad,
        deleteCiudad,
        countInmueblesByCiudad,
        countInmueblesByDepartamento,
        fetchBarrios,
        addBarrio,
        renameBarrio,
        deleteBarrio,
        countInmueblesByBarrio,
        mergeBarrios,
        getOrCreateBarrio
    };
};
