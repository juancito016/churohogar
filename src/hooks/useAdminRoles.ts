import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import type { PermisoAdmin, RolAdmin } from '../types/rbac';

type RpcRol = {
    id: string;
    nombre: string;
    descripcion: string | null;
    es_sistema: boolean;
    permisos: string[] | null;
    usuarios: number;
};

type RpcPermiso = {
    clave: string;
    grupo: string;
    descripcion: string;
};

export const useAdminRoles = (enabled: boolean) => {
    const [roles, setRoles] = useState<RolAdmin[]>([]);
    const [permisos, setPermisos] = useState<PermisoAdmin[]>([]);
    const [loading, setLoading] = useState(enabled);
    const [error, setError] = useState<string | null>(null);

    const cargar = useCallback(async () => {
        if (!enabled) return;

        const [rolesResult, permisosResult] = await Promise.all([
            supabase.rpc('admin_roles_list'),
            supabase.rpc('admin_permisos_list'),
        ]);

        if (rolesResult.error || permisosResult.error) {
            setRoles([]);
            setPermisos([]);
            setError((rolesResult.error ?? permisosResult.error)?.message ?? 'No se pudieron cargar los roles.');
        } else {
            setRoles(((rolesResult.data ?? []) as RpcRol[]).map(row => ({
                id: row.id,
                nombre: row.nombre,
                descripcion: row.descripcion,
                esSistema: Boolean(row.es_sistema),
                permisos: row.permisos ?? [],
                usuarios: Number(row.usuarios ?? 0),
            })));

            setPermisos(((permisosResult.data ?? []) as RpcPermiso[]).map(row => ({
                clave: row.clave,
                grupo: row.grupo,
                descripcion: row.descripcion,
            })));

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

    const crear = useCallback(async (nombre: string, descripcion: string) => {
        const { error: rpcError } = await supabase.rpc('admin_role_create', {
            p_nombre: nombre,
            p_descripcion: descripcion || null,
        });

        if (rpcError) throw rpcError;

        await cargar();
    }, [cargar]);

    const actualizar = useCallback(async (rolId: string, nombre: string, descripcion: string) => {
        const { error: rpcError } = await supabase.rpc('admin_role_update', {
            p_role: rolId,
            p_nombre: nombre,
            p_descripcion: descripcion || null,
        });

        if (rpcError) throw rpcError;

        await cargar();
    }, [cargar]);

    const eliminar = useCallback(async (rolId: string) => {
        const { error: rpcError } = await supabase.rpc('admin_role_delete', {
            p_role: rolId,
        });

        if (rpcError) throw rpcError;

        await cargar();
    }, [cargar]);

    const guardarPermisos = useCallback(async (rolId: string, claves: string[]) => {
        const { error: rpcError } = await supabase.rpc('admin_set_role_permissions', {
            p_role: rolId,
            p_permisos: claves,
        });

        if (rpcError) throw rpcError;

        await cargar();
    }, [cargar]);

    return {
        roles,
        permisos,
        loading,
        error,
        cargar,
        crear,
        actualizar,
        eliminar,
        guardarPermisos,
    };
};
