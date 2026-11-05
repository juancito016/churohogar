import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { readFunctionError } from '../utils/syncEmbedding';
import type { NuevoUsuario, UsuarioAdmin } from '../types/rbac';

type RpcUsuario = {
    user_id: string;
    email: string;
    nombre: string | null;
    activo: boolean;
    roles: Array<{ id: string; nombre: string; esSistema: boolean }> | null;
    inmuebles: number;
    ultimo_acceso: string | null;
    creado_at: string;
    es_yo: boolean;
};

const mapear = (row: RpcUsuario): UsuarioAdmin => ({
    userId: row.user_id,
    email: row.email,
    nombre: row.nombre,
    activo: row.activo,
    roles: (row.roles ?? []).map(rol => ({
        id: rol.id,
        nombre: rol.nombre,
        esSistema: Boolean(rol.esSistema),
    })),
    inmuebles: Number(row.inmuebles ?? 0),
    ultimoAcceso: row.ultimo_acceso,
    creadoAt: row.creado_at,
    esYo: Boolean(row.es_yo),
});

export const useAdminUsers = (enabled: boolean) => {
    const [usuarios, setUsuarios] = useState<UsuarioAdmin[]>([]);
    const [loading, setLoading] = useState(enabled);
    const [error, setError] = useState<string | null>(null);

    const cargar = useCallback(async () => {
        if (!enabled) return;

        const { data, error: rpcError } = await supabase.rpc('admin_usuarios_list');

        if (rpcError) {
            setUsuarios([]);
            setError(rpcError.message);
        } else {
            setUsuarios(((data ?? []) as RpcUsuario[]).map(mapear));
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

    const llamarFuncion = useCallback(async (body: Record<string, unknown>) => {
        const { error: invokeError } = await supabase.functions.invoke('admin-users', { body });

        if (invokeError) {
            throw new Error(await readFunctionError(invokeError));
        }
    }, []);

    const crear = useCallback(async (nuevo: NuevoUsuario) => {
        await llamarFuncion({
            action: 'create',
            email: nuevo.email,
            password: nuevo.password,
            nombre: nuevo.nombre,
            role_ids: nuevo.roleIds,
        });
        await cargar();
    }, [cargar, llamarFuncion]);

    const guardar = useCallback(async (
        usuario: UsuarioAdmin,
        email: string,
        roleIds: string[],
        nuevaPassword?: string
    ) => {
        if (email.trim().toLowerCase() !== usuario.email.toLowerCase()) {
            await llamarFuncion({
                action: 'update_email',
                user_id: usuario.userId,
                email: email.trim().toLowerCase(),
            });
        }

        const antes = [...usuario.roles.map(rol => rol.id)].sort().join(',');
        const despues = [...roleIds].sort().join(',');

        if (antes !== despues) {
            const { error: rpcError } = await supabase.rpc('admin_set_user_roles', {
                p_user: usuario.userId,
                p_roles: roleIds,
            });

            if (rpcError) throw rpcError;
        }

        if (nuevaPassword) {
            await llamarFuncion({
                action: 'reset_password',
                user_id: usuario.userId,
                password: nuevaPassword,
            });
        }

        await cargar();
    }, [cargar, llamarFuncion]);

    const cambiarActivo = useCallback(async (userId: string, activo: boolean) => {
        const { error: rpcError } = await supabase.rpc('admin_user_set_active', {
            p_user: userId,
            p_activo: activo,
        });

        if (rpcError) throw rpcError;

        await cargar();
    }, [cargar]);

    const eliminar = useCallback(async (userId: string) => {
        await llamarFuncion({ action: 'delete', user_id: userId });
        await cargar();
    }, [cargar, llamarFuncion]);

    return {
        usuarios,
        loading,
        error,
        cargar,
        crear,
        guardar,
        cambiarActivo,
        eliminar,
    };
};
