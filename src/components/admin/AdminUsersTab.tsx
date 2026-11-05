/**
 * ADM-41 — Gestión de administradores.
 *
 * Crear usuarios (sin invitación), asignar roles, activar/desactivar,
 * restablecer contraseña y eliminar. Las reglas de quién puede hacer qué
 * las aplica la base; aquí solo se esconden las acciones no permitidas.
 */

import React, { useState } from 'react';
import {
    FaEdit,
    FaLock,
    FaPlus,
    FaSyncAlt,
    FaTrash,
    FaUserCheck,
    FaUserSlash,
} from 'react-icons/fa';
import toast from 'react-hot-toast';
import { useAdminUsers } from '../../hooks/useAdminUsers';
import { useAdminRoles } from '../../hooks/useAdminRoles';
import { mensajeError } from '../../utils/errors';
import { formatFecha } from '../../utils/helpers';
import { AccessibleModal } from '../ui/AccessibleModal';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { UserFormModal } from './UserFormModal';
import { puedeHacer, type UsuarioAdmin } from '../../types/rbac';

interface AdminUsersTabProps {
    permisos: string[];
    miUserId: string;
    legacy?: boolean;
}

export const AdminUsersTab: React.FC<AdminUsersTabProps> = ({
    permisos,
    legacy = false,
}) => {
    const puedeVerRoles = puedeHacer(permisos, 'roles.ver', legacy);
    const {
        usuarios,
        loading,
        error,
        cargar,
        crear,
        guardar,
        cambiarActivo,
        eliminar,
    } = useAdminUsers(!legacy);

    const { roles } = useAdminRoles(!legacy && puedeVerRoles);

    const [modalAbierto, setModalAbierto] = useState(false);
    const [usuarioEditando, setUsuarioEditando] = useState<UsuarioAdmin | null>(null);
    const [confirmarEliminar, setConfirmarEliminar] = useState<UsuarioAdmin | null>(null);
    const [confirmarDesactivar, setConfirmarDesactivar] = useState<UsuarioAdmin | null>(null);
    const [procesando, setProcesando] = useState(false);
    const [detalle, setDetalle] = useState<UsuarioAdmin | null>(null);

    const puedeCrear = puedeHacer(permisos, 'usuarios.crear', legacy);
    const puedeEditar = puedeHacer(permisos, 'usuarios.editar', legacy)
        || puedeHacer(permisos, 'roles.asignar', legacy);
    const puedeActivar = puedeHacer(permisos, 'usuarios.desactivar', legacy);
    const puedeEliminar = puedeHacer(permisos, 'usuarios.eliminar', legacy);

    const abrirCrear = () => {
        setUsuarioEditando(null);
        setModalAbierto(true);
    };

    const abrirEditar = (usuario: UsuarioAdmin) => {
        setUsuarioEditando(usuario);
        setModalAbierto(true);
    };

    const alternarActivo = async (usuario: UsuarioAdmin) => {
        setProcesando(true);

        try {
            await cambiarActivo(usuario.userId, !usuario.activo);
            toast.success(usuario.activo ? 'Usuario desactivado.' : 'Usuario activado.');
            setConfirmarDesactivar(null);
        } catch (toggleError) {
            toast.error(mensajeError(toggleError, 'No se pudo cambiar el estado.'));
        } finally {
            setProcesando(false);
        }
    };

    const borrar = async () => {
        if (!confirmarEliminar) return;

        setProcesando(true);

        try {
            await eliminar(confirmarEliminar.userId);
            toast.success('Usuario eliminado.');
            setConfirmarEliminar(null);
        } catch (deleteError) {
            toast.error(mensajeError(deleteError, 'No se pudo eliminar el usuario.'));
            setConfirmarEliminar(null);
        } finally {
            setProcesando(false);
        }
    };

    if (legacy) {
        return (
            <div className="rounded-2xl border border-admin-warning/30 bg-admin-warning-soft p-6 text-sm font-semibold text-admin-warning">
                La gestión de usuarios no está disponible en este momento.
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <h2 className="font-serif text-2xl font-bold text-admin-text">Administradores</h2>
                    <p className="text-sm text-admin-muted">
                        Crea accesos al panel y asígnales roles. No se envía ningún correo.
                    </p>
                </div>
                {puedeCrear && (
                    <button
                        type="button"
                        onClick={abrirCrear}
                        className="flex items-center justify-center gap-2 rounded-xl bg-admin-primary px-4 py-3 font-bold text-white transition hover:bg-admin-primary-hover"
                    >
                        <FaPlus aria-hidden /> Nuevo usuario
                    </button>
                )}
            </div>

            {error && (
                <div className="rounded-2xl border border-admin-danger/30 bg-admin-danger-soft p-4">
                    <p className="text-sm font-semibold text-admin-danger">
                        {mensajeError(error, 'No se pudieron cargar los usuarios.')}
                    </p>
                    <button
                        type="button"
                        onClick={cargar}
                        className="mt-3 rounded-xl bg-admin-danger-strong px-4 py-2 text-sm font-bold text-white hover:bg-admin-danger-strong/80"
                    >
                        Reintentar
                    </button>
                </div>
            )}

            <div className="space-y-3 xl:hidden">
                {loading && (
                    Array.from({ length: 3 }).map((_, index) => (
                        <div key={`skeleton-mobile-${index}`} className="h-28 animate-pulse rounded-2xl bg-admin-surface-2" />
                    ))
                )}

                {!loading && usuarios.length === 0 && (
                    <p className="rounded-2xl border border-admin-border bg-admin-surface p-6 text-center text-sm text-admin-muted">
                        No hay administradores todavía.
                    </p>
                )}

                {!loading && usuarios.map(usuario => (
                    <article
                        key={usuario.userId}
                        className={`rounded-2xl border bg-admin-surface p-4 ${usuario.esYo ? 'border-admin-primary/50' : 'border-admin-border'}`}
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <p className="font-bold text-admin-text">
                                    {usuario.nombre || 'Sin nombre'}
                                    {usuario.esYo && (
                                        <span className="ml-2 rounded-full border border-admin-primary/50 px-2 py-0.5 text-[10px] font-bold text-admin-primary">
                                            Tú
                                        </span>
                                    )}
                                </p>
                                <p className="truncate text-xs text-admin-muted">{usuario.email}</p>
                            </div>
                            <span className={`shrink-0 rounded-full border px-2 py-1 text-[11px] font-bold ${
                                usuario.activo
                                    ? 'border-admin-success/40 text-admin-success'
                                    : 'border-admin-danger/40 text-admin-danger'
                            }`}>
                                {usuario.activo ? 'Activo' : 'Desactivado'}
                            </span>
                        </div>

                        <div className="mt-2 flex flex-wrap gap-1">
                            {usuario.roles.length === 0 && (
                                <span className="text-xs font-semibold text-admin-warning">Sin rol</span>
                            )}
                            {usuario.roles.map(rol => (
                                <span
                                    key={rol.id}
                                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                                        rol.esSistema
                                            ? 'bg-admin-surface-2 text-admin-text'
                                            : 'border border-admin-border text-admin-muted'
                                    }`}
                                >
                                    {rol.esSistema && <FaLock aria-hidden size={9} />}
                                    {rol.nombre}
                                </span>
                            ))}
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-admin-muted">
                            <span>{usuario.inmuebles} inmueble(s)</span>
                            <span>Último acceso: {usuario.ultimoAcceso ? formatFecha(usuario.ultimoAcceso) : 'Nunca'}</span>
                        </div>

                        <div className="mt-3 flex items-center gap-1 border-t border-admin-border pt-2">
                            <button
                                type="button"
                                onClick={() => abrirEditar(usuario)}
                                disabled={!puedeEditar}
                                className="rounded-lg p-2 text-admin-info transition hover:bg-admin-surface-2 disabled:cursor-not-allowed disabled:opacity-30"
                                title="Editar usuario"
                                aria-label={`Editar ${usuario.email}`}
                            >
                                <FaEdit aria-hidden />
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    if (usuario.activo) setConfirmarDesactivar(usuario);
                                    else alternarActivo(usuario);
                                }}
                                disabled={!puedeActivar || usuario.esYo}
                                className="rounded-lg p-2 text-admin-warning transition hover:bg-admin-surface-2 disabled:cursor-not-allowed disabled:opacity-30"
                                title={usuario.esYo ? 'No puedes desactivarte' : (usuario.activo ? 'Desactivar' : 'Activar')}
                                aria-label={`${usuario.activo ? 'Desactivar' : 'Activar'} ${usuario.email}`}
                            >
                                {usuario.activo ? <FaUserSlash aria-hidden /> : <FaUserCheck aria-hidden />}
                            </button>
                            <button
                                type="button"
                                onClick={() => setDetalle(usuario)}
                                className="rounded-lg p-2 text-admin-muted transition hover:bg-admin-surface-2"
                                title="Ver detalle"
                                aria-label={`Ver detalle de ${usuario.email}`}
                            >
                                <FaSyncAlt aria-hidden className="rotate-45" />
                            </button>
                            <button
                                type="button"
                                onClick={() => setConfirmarEliminar(usuario)}
                                disabled={!puedeEliminar || usuario.esYo}
                                className="ml-auto rounded-lg p-2 text-admin-danger transition hover:bg-admin-surface-2 disabled:cursor-not-allowed disabled:opacity-30"
                                title={usuario.esYo ? 'No puedes eliminarte' : 'Eliminar usuario'}
                                aria-label={`Eliminar ${usuario.email}`}
                            >
                                <FaTrash aria-hidden />
                            </button>
                        </div>
                    </article>
                ))}
            </div>

            <div className="hidden overflow-x-auto rounded-3xl border border-admin-border bg-admin-surface xl:block">
                <table className="w-full min-w-[760px] text-left text-sm">
                    <caption className="sr-only">
                        Administradores del panel con sus roles, estado e inmuebles
                    </caption>
                    <thead className="border-b bg-admin-surface-2 text-xs uppercase tracking-wide text-admin-muted">
                        <tr>
                            <th scope="col" className="p-4">Usuario</th>
                            <th scope="col" className="p-4">Roles</th>
                            <th scope="col" className="p-4">Estado</th>
                            <th scope="col" className="p-4">Inmuebles</th>
                            <th scope="col" className="p-4">Último acceso</th>
                            <th scope="col" className="p-4 text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && (
                            Array.from({ length: 3 }).map((_, index) => (
                                <tr key={`skeleton-${index}`} className="border-b last:border-0">
                                    <td colSpan={6} className="p-4">
                                        <div className="h-8 animate-pulse rounded-lg bg-admin-surface-2" />
                                    </td>
                                </tr>
                            ))
                        )}

                        {!loading && usuarios.length === 0 && (
                            <tr>
                                <td colSpan={6} className="p-8 text-center text-admin-muted">
                                    No hay administradores todavía.
                                </td>
                            </tr>
                        )}

                        {!loading && usuarios.map(usuario => (
                            <tr key={usuario.userId} className="border-b last:border-0 hover:bg-admin-surface-2">
                                <td className="p-4">
                                    <div className="font-bold text-admin-text">
                                        {usuario.nombre || 'Sin nombre'}
                                        {usuario.esYo && (
                                            <span className="ml-2 rounded-full bg-admin-accent-soft px-2 py-0.5 text-[10px] font-bold text-admin-accent">
                                                Tú
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-xs text-admin-muted">{usuario.email}</div>
                                </td>
                                <td className="p-4">
                                    <div className="flex flex-wrap gap-1">
                                        {usuario.roles.length === 0 && (
                                            <span className="text-xs font-semibold text-admin-warning">Sin rol</span>
                                        )}
                                        {usuario.roles.map(rol => (
                                            <span
                                                key={rol.id}
                                                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                                                    rol.esSistema
                                                        ? 'bg-admin-surface text-white'
                                                        : 'bg-admin-surface-2 text-admin-text'
                                                }`}
                                            >
                                                {rol.esSistema && <FaLock aria-hidden size={9} />}
                                                {rol.nombre}
                                            </span>
                                        ))}
                                    </div>
                                </td>
                                <td className="p-4">
                                    <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${
                                        usuario.activo
                                            ? 'border border-admin-success/40 text-admin-success'
                                            : 'border border-admin-danger/40 text-admin-danger'
                                    }`}>
                                        {usuario.activo ? 'Activo' : 'Desactivado'}
                                    </span>
                                </td>
                                <td className="p-4 font-semibold text-admin-text">{usuario.inmuebles}</td>
                                <td className="p-4 text-xs text-admin-muted">
                                    {usuario.ultimoAcceso ? formatFecha(usuario.ultimoAcceso) : 'Nunca'}
                                </td>
                                <td className="p-4">
                                    <div className="flex items-center justify-end gap-1">
                                        <button
                                            type="button"
                                            onClick={() => abrirEditar(usuario)}
                                            disabled={!puedeEditar}
                                            className="rounded-lg p-2 text-admin-info transition hover:bg-admin-info-soft disabled:cursor-not-allowed disabled:opacity-30"
                                            title={usuario.esYo ? 'Edita tu email o contraseña, pero no tus roles' : 'Editar usuario'}
                                            aria-label={`Editar ${usuario.email}`}
                                        >
                                            <FaEdit aria-hidden />
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (usuario.activo) setConfirmarDesactivar(usuario);
                                                else alternarActivo(usuario);
                                            }}
                                            disabled={!puedeActivar || usuario.esYo}
                                            className="rounded-lg p-2 text-admin-warning transition hover:bg-admin-warning-soft disabled:cursor-not-allowed disabled:opacity-30"
                                            title={usuario.esYo ? 'No puedes desactivarte' : (usuario.activo ? 'Desactivar' : 'Activar')}
                                            aria-label={`${usuario.activo ? 'Desactivar' : 'Activar'} ${usuario.email}`}
                                        >
                                            {usuario.activo ? <FaUserSlash aria-hidden /> : <FaUserCheck aria-hidden />}
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setDetalle(usuario)}
                                            className="rounded-lg p-2 text-admin-muted transition hover:bg-admin-surface-2"
                                            title="Ver detalle"
                                            aria-label={`Ver detalle de ${usuario.email}`}
                                        >
                                            <FaSyncAlt aria-hidden className="rotate-45" />
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setConfirmarEliminar(usuario)}
                                            disabled={!puedeEliminar || usuario.esYo}
                                            className="rounded-lg p-2 text-admin-danger transition hover:bg-admin-danger-soft disabled:cursor-not-allowed disabled:opacity-30"
                                            title={usuario.esYo ? 'No puedes eliminarte' : 'Eliminar usuario'}
                                            aria-label={`Eliminar ${usuario.email}`}
                                        >
                                            <FaTrash aria-hidden />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {modalAbierto && (
                <UserFormModal
                    usuario={usuarioEditando}
                    roles={roles}
                    puedeAsignarRoles={puedeHacer(permisos, 'roles.asignar', legacy)}
                    onClose={() => {
                        setModalAbierto(false);
                        setUsuarioEditando(null);
                    }}
                    onCrear={crear}
                    onGuardar={guardar}
                />
            )}

            <ConfirmDialog
                open={Boolean(confirmarDesactivar)}
                title="Desactivar usuario"
                description={`${confirmarDesactivar?.email ?? ''} dejará de poder entrar al panel. Sus inmuebles se conservan.`}
                confirmLabel="Desactivar"
                tone="warning"
                loading={procesando}
                onCancel={() => setConfirmarDesactivar(null)}
                onConfirm={() => confirmarDesactivar && alternarActivo(confirmarDesactivar)}
            />

            <ConfirmDialog
                open={Boolean(confirmarEliminar)}
                title="Eliminar usuario"
                description={
                    confirmarEliminar && confirmarEliminar.inmuebles > 0
                        ? `Tiene ${confirmarEliminar.inmuebles} inmueble(s). Reasígnalos o desactívalo en lugar de eliminarlo.`
                        : `Se borrará la cuenta de ${confirmarEliminar?.email ?? ''} y no podrá volver a entrar. Esta acción no se puede deshacer.`
                }
                confirmLabel="Eliminar usuario"
                loading={procesando}
                onCancel={() => setConfirmarEliminar(null)}
                onConfirm={borrar}
            />

            {detalle && (
                <AccessibleModal
                    onClose={() => setDetalle(null)}
                    labelledBy="detalle-usuario-titulo"
                    className="w-full max-w-md rounded-3xl bg-admin-surface p-6 shadow-2xl"
                >
                    <h3 id="detalle-usuario-titulo" className="font-serif text-xl font-bold text-admin-text">
                        {detalle.nombre || detalle.email}
                    </h3>
                    <dl className="mt-4 space-y-2 text-sm">
                        <div className="flex justify-between gap-3">
                            <dt className="font-semibold text-admin-muted">Email</dt>
                            <dd className="text-admin-text">{detalle.email}</dd>
                        </div>
                        <div className="flex justify-between gap-3">
                            <dt className="font-semibold text-admin-muted">Roles</dt>
                            <dd className="text-right text-admin-text">
                                {detalle.roles.map(rol => rol.nombre).join(', ') || 'Sin rol'}
                            </dd>
                        </div>
                        <div className="flex justify-between gap-3">
                            <dt className="font-semibold text-admin-muted">Inmuebles</dt>
                            <dd className="text-admin-text">{detalle.inmuebles}</dd>
                        </div>
                        <div className="flex justify-between gap-3">
                            <dt className="font-semibold text-admin-muted">Creado</dt>
                            <dd className="text-admin-text">{formatFecha(detalle.creadoAt)}</dd>
                        </div>
                        <div className="flex justify-between gap-3">
                            <dt className="font-semibold text-admin-muted">Último acceso</dt>
                            <dd className="text-admin-text">
                                {detalle.ultimoAcceso ? formatFecha(detalle.ultimoAcceso) : 'Nunca'}
                            </dd>
                        </div>
                    </dl>
                    <button
                        type="button"
                        onClick={() => setDetalle(null)}
                        className="mt-5 w-full rounded-xl bg-admin-surface px-5 py-3 font-bold text-white hover:bg-admin-surface-2"
                    >
                        Cerrar
                    </button>
                </AccessibleModal>
            )}
        </div>
    );
};
