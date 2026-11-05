/**
 * ADM-41 — Gestión de usuarios del panel.
 *
 * Crear usuarios y cambiar contraseñas ajenas exige `service_role`, que no
 * puede vivir en el navegador. Esta función es la única puerta:
 *
 *   - Verifica el JWT del llamante y su permiso concreto (`admin_mis_permisos`).
 *   - Crea la cuenta ya confirmada (`email_confirm: true`), sin invitación ni SMTP.
 *   - Si falla el alta en `admins` o en los roles, borra la cuenta recién
 *     creada para no dejar usuarios a medias.
 *   - Audita cada operación en `admin_auditoria`.
 *
 * Acciones: create | update_email | reset_password | delete
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import { logError, logInfo, logWarn } from '../_shared/log.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Action = 'create' | 'update_email' | 'reset_password' | 'delete';

const REQUIRED_PERMISSION: Record<Action, string> = {
    create: 'usuarios.crear',
    update_email: 'usuarios.editar',
    reset_password: 'usuarios.editar',
    delete: 'usuarios.eliminar',
};

const MIN_PASSWORD = 8;
const MAX_NAME = 120;

const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });

const isUuid = (value: unknown): value is string =>
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

const isEmail = (value: unknown): value is string =>
    typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());

const normalizarNombre = (value: unknown, email: string) => {
    const limpio = typeof value === 'string' ? value.trim().slice(0, MAX_NAME) : '';
    return limpio || email.split('@')[0];
};

const auditar = async (
    adminClient: ReturnType<typeof createClient>,
    actorId: string,
    accion: string,
    entidadId: string,
    datos: Record<string, unknown>
) => {
    const { error } = await adminClient.from('admin_auditoria').insert({
        actor_id: actorId,
        accion,
        entidad: 'admins',
        entidad_id: entidadId,
        datos,
    });

    if (error) {
        logWarn('admin_users_audit_failed', { accion, message: error.message });
    }
};

const traducirErrorAuth = (message: string) => {
    const texto = message.toLowerCase();
    if (texto.includes('already') || texto.includes('registered') || texto.includes('exists')) {
        return 'Ese email ya tiene una cuenta.';
    }
    if (texto.includes('password')) {
        return `La contraseña no es válida. Debe tener al menos ${MIN_PASSWORD} caracteres.`;
    }
    if (texto.includes('email')) {
        return 'El email no es válido.';
    }
    return 'No se pudo completar la operación con la cuenta.';
};

const validarRoles = async (
    adminClient: ReturnType<typeof createClient>,
    roleIds: unknown
) => {
    if (!Array.isArray(roleIds) || roleIds.length === 0) {
        return { ok: false as const, message: 'Asigna al menos un rol al usuario.' };
    }

    const ids = [...new Set(roleIds)].filter(isUuid);
    if (ids.length !== roleIds.length) {
        return { ok: false as const, message: 'Hay roles con un identificador inválido.' };
    }

    const { data, error } = await adminClient
        .from('admin_roles')
        .select('id')
        .in('id', ids);

    if (error) throw error;

    if ((data ?? []).length !== ids.length) {
        return { ok: false as const, message: 'Alguno de los roles ya no existe.' };
    }

    return { ok: true as const, ids };
};

Deno.serve(async (request) => {
    if (request.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    if (request.method !== 'POST') {
        return jsonResponse({ error: 'Método no permitido.' }, 405);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
        logError('admin_users_failed', new Error('Faltan variables de entorno'), { reason: 'env' });
        return jsonResponse({ error: 'Configuración incompleta del servidor.' }, 500);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });

    const authorization = request.headers.get('Authorization') ?? '';
    const token = authorization.replace(/^Bearer\s+/i, '').trim();

    if (!token) {
        return jsonResponse({ error: 'No autorizado.' }, 401);
    }

    const { data: userData, error: userError } = await adminClient.auth.getUser(token);

    if (userError || !userData.user) {
        logWarn('admin_users_rejected', { status: 401, reason: 'jwt_invalido' });
        return jsonResponse({ error: 'Sesión inválida.' }, 401);
    }

    // Se consultan los permisos con el JWT del llamante para que auth.uid()
    // sea el suyo y no el de service_role.
    const userClient = createClient(supabaseUrl, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: permisos, error: permisosError } = await userClient.rpc('admin_mis_permisos');

    if (permisosError) {
        logError('admin_users_failed', permisosError, { reason: 'permisos' });
        return jsonResponse({ error: 'No se pudieron verificar tus permisos.' }, 403);
    }

    const listaPermisos: string[] = Array.isArray(permisos) ? permisos : [];
    const tienePermiso = (clave: string) => listaPermisos.includes(clave);

    let body: Record<string, unknown>;
    try {
        body = await request.json();
    } catch {
        return jsonResponse({ error: 'Cuerpo JSON inválido.' }, 400);
    }

    const action = body.action as Action;
    const permiso = REQUIRED_PERMISSION[action];

    if (!permiso) {
        return jsonResponse({ error: 'Acción no soportada.' }, 400);
    }

    if (!tienePermiso(permiso)) {
        logWarn('admin_users_rejected', {
            status: 403,
            action,
            permiso,
            user: userData.user.id,
        });
        return jsonResponse({ error: 'No tienes permiso para esta acción.' }, 403);
    }

    try {
        if (action === 'create') {
            const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
            const password = typeof body.password === 'string' ? body.password : '';
            const nombre = normalizarNombre(body.nombre, email);

            if (!isEmail(email)) {
                return jsonResponse({ error: 'El email no es válido.' }, 400);
            }
            if (password.length < MIN_PASSWORD) {
                return jsonResponse({ error: `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.` }, 400);
            }

            const roles = await validarRoles(adminClient, body.role_ids);
            if (!roles.ok) {
                return jsonResponse({ error: roles.message }, 400);
            }

            const { data: creado, error: createError } = await adminClient.auth.admin.createUser({
                email,
                password,
                email_confirm: true,
                user_metadata: { nombre },
            });

            if (createError || !creado.user) {
                logWarn('admin_users_rejected', {
                    status: 409,
                    action,
                    reason: createError?.message ?? 'sin_usuario',
                });
                return jsonResponse({ error: traducirErrorAuth(createError?.message ?? '') }, 409);
            }

            const nuevoId = creado.user.id;

            try {
                const { error: adminError } = await adminClient
                    .from('admins')
                    .insert({ user_id: nuevoId, nombre, activo: true });

                if (adminError) throw adminError;

                const { error: rolesError } = await adminClient
                    .from('admin_usuarios_roles')
                    .insert(roles.ids.map(rolId => ({ user_id: nuevoId, rol_id: rolId })));

                if (rolesError) throw rolesError;
            } catch (error) {
                // Compensación: no dejar una cuenta de Auth sin fila en admins.
                await adminClient.auth.admin.deleteUser(nuevoId);
                throw error;
            }

            await auditar(adminClient, userData.user.id, 'crear_usuario', nuevoId, {
                email,
                nombre,
                roles: roles.ids,
            });

            logInfo('admin_users', { action, status: 200, user: nuevoId });
            return jsonResponse({ ok: true, user_id: nuevoId });
        }

        const userId = body.user_id;
        if (!isUuid(userId)) {
            return jsonResponse({ error: 'Usuario inválido.' }, 400);
        }

        const { data: adminRow, error: adminLookupError } = await adminClient
            .from('admins')
            .select('user_id, nombre')
            .eq('user_id', userId)
            .maybeSingle();

        if (adminLookupError) throw adminLookupError;

        if (!adminRow) {
            return jsonResponse({ error: 'El usuario no pertenece al panel.' }, 404);
        }

        if (action === 'update_email') {
            const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
            if (!isEmail(email)) {
                return jsonResponse({ error: 'El email no es válido.' }, 400);
            }

            const { error } = await adminClient.auth.admin.updateUserById(userId, {
                email,
                email_confirm: true,
            });

            if (error) {
                return jsonResponse({ error: traducirErrorAuth(error.message) }, 409);
            }

            await auditar(adminClient, userData.user.id, 'cambiar_email', userId, { email });
            logInfo('admin_users', { action, status: 200, user: userId });
            return jsonResponse({ ok: true });
        }

        if (action === 'reset_password') {
            const password = typeof body.password === 'string' ? body.password : '';
            if (password.length < MIN_PASSWORD) {
                return jsonResponse({ error: `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.` }, 400);
            }

            const { error } = await adminClient.auth.admin.updateUserById(userId, { password });

            if (error) {
                return jsonResponse({ error: traducirErrorAuth(error.message) }, 400);
            }

            await auditar(adminClient, userData.user.id, 'resetear_password', userId, {});
            logInfo('admin_users', { action, status: 200, user: userId });
            return jsonResponse({ ok: true });
        }

        // delete
        const { data: check, error: checkError } = await userClient.rpc('admin_user_delete_check', {
            p_user: userId,
        });

        if (checkError) {
            const mensaje = checkError.message.includes('propia')
                ? 'No puedes eliminar tu propia cuenta.'
                : 'No se pudo validar el borrado.';
            return jsonResponse({ error: mensaje }, 403);
        }

        const inmuebles = Number((check as { inmuebles?: number } | null)?.inmuebles ?? 0);
        const otrosSuperadmins = Number((check as { otrosSuperadmins?: number } | null)?.otrosSuperadmins ?? 0);

        if (inmuebles > 0) {
            return jsonResponse({
                error: `Ese usuario tiene ${inmuebles} inmueble(s). Reasígnalos o desactívalo en lugar de eliminarlo.`,
                code: 'TIENE_INMUEBLES',
                inmuebles,
            }, 409);
        }

        if (otrosSuperadmins === 0) {
            return jsonResponse({
                error: 'Debe quedar al menos un Superadmin activo.',
                code: 'ULTIMO_SUPERADMIN',
            }, 409);
        }

        const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);

        if (deleteError) {
            logWarn('admin_users_rejected', { status: 400, action, reason: deleteError.message });
            return jsonResponse({ error: traducirErrorAuth(deleteError.message) }, 400);
        }

        await auditar(adminClient, userData.user.id, 'eliminar_usuario', userId, {
            email: (check as { email?: string } | null)?.email ?? null,
        });

        logInfo('admin_users', { action, status: 200, user: userId });
        return jsonResponse({ ok: true });
    } catch (error) {
        logError('admin_users_failed', error, { action, user: userData.user.id });
        const mensaje = error instanceof Error ? error.message : 'Error inesperado.';
        return jsonResponse({ error: mensaje }, 500);
    }
});
