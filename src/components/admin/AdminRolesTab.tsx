/**
 * ADM-41 — Gestión de roles y permisos.
 *
 * Lista los roles, permite crear/renombrar/borrar y editar su matriz de
 * permisos. El rol de sistema (Superadmin) se muestra como solo lectura.
 */

import React, { useEffect, useId, useState } from 'react';
import {
    FaEdit,
    FaLock,
    FaPlus,
    FaSave,
    FaTrash,
    FaUsers,
} from 'react-icons/fa';
import toast from 'react-hot-toast';
import { useAdminRoles } from '../../hooks/useAdminRoles';
import { mensajeError } from '../../utils/errors';
import { AccessibleModal } from '../ui/AccessibleModal';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { PermissionMatrix } from './PermissionMatrix';
import { puedeHacer } from '../../types/rbac';

interface AdminRolesTabProps {
    permisos: string[];
    legacy?: boolean;
}

type ModalRol = 'crear' | 'editar' | null;

export const AdminRolesTab: React.FC<AdminRolesTabProps> = ({ permisos, legacy = false }) => {
    const {
        roles,
        permisos: catalogo,
        loading,
        error,
        cargar,
        crear,
        actualizar,
        eliminar,
        guardarPermisos,
    } = useAdminRoles(!legacy);

    const [seleccionadoId, setSeleccionadoId] = useState<string | null>(null);
    const [borrador, setBorrador] = useState<string[]>([]);
    const [dirty, setDirty] = useState(false);
    const [modal, setModal] = useState<ModalRol>(null);
    const [nombre, setNombre] = useState('');
    const [descripcion, setDescripcion] = useState('');
    const [errorModal, setErrorModal] = useState<string | null>(null);
    const [guardando, setGuardando] = useState(false);
    const [confirmarBorrar, setConfirmarBorrar] = useState(false);
    const [pendienteId, setPendienteId] = useState<string | null>(null);
    const [verConfirmacionCambio, setVerConfirmacionCambio] = useState(false);

    const titleId = useId();
    const descriptionId = useId();

    const puedeCrear = puedeHacer(permisos, 'roles.crear', legacy);
    const puedeEditar = puedeHacer(permisos, 'roles.editar', legacy);
    const puedeEliminar = puedeHacer(permisos, 'roles.eliminar', legacy);

    useEffect(() => {
        if (roles.length === 0) {
            setSeleccionadoId(null);
            setBorrador([]);
            setDirty(false);
            return;
        }

        const actual = roles.find(rol => rol.id === seleccionadoId) ?? roles[0];
        setSeleccionadoId(actual.id);
        setBorrador([...actual.permisos]);
        setDirty(false);
        // Solo se resincroniza cuando cambia la lista de roles.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [roles]);

    const rolActual = roles.find(rol => rol.id === seleccionadoId) ?? null;
    const esSistema = Boolean(rolActual?.esSistema);
    const deshabilitado = !puedeEditar || esSistema || guardando;

    const seleccionar = (id: string) => {
        if (id === seleccionadoId) return;

        if (dirty) {
            setPendienteId(id);
            setVerConfirmacionCambio(true);
            return;
        }

        aplicarSeleccion(id);
    };

    const aplicarSeleccion = (id: string) => {
        const nuevo = roles.find(rol => rol.id === id);
        setSeleccionadoId(id);
        setBorrador(nuevo ? [...nuevo.permisos] : []);
        setDirty(false);
    };

    const guardar = async () => {
        if (!rolActual || deshabilitado) return;

        setGuardando(true);

        try {
            await guardarPermisos(rolActual.id, borrador);
            setDirty(false);
            toast.success('Permisos guardados.');
        } catch (saveError) {
            toast.error(mensajeError(saveError, 'No se pudieron guardar los permisos.'));
        } finally {
            setGuardando(false);
        }
    };

    const abrirCrear = () => {
        setNombre('');
        setDescripcion('');
        setErrorModal(null);
        setModal('crear');
    };

    const abrirEditar = () => {
        if (!rolActual || esSistema) return;
        setNombre(rolActual.nombre);
        setDescripcion(rolActual.descripcion ?? '');
        setErrorModal(null);
        setModal('editar');
    };

    const enviarModal = async (event: React.FormEvent) => {
        event.preventDefault();
        setErrorModal(null);
        setGuardando(true);

        try {
            if (modal === 'crear') {
                await crear(nombre, descripcion);
                toast.success('Rol creado.');
            } else if (modal === 'editar' && rolActual) {
                await actualizar(rolActual.id, nombre, descripcion);
                toast.success('Rol actualizado.');
            }
            setModal(null);
        } catch (modalError) {
            setErrorModal(mensajeError(modalError, 'No se pudo guardar el rol.'));
        } finally {
            setGuardando(false);
        }
    };

    const borrar = async () => {
        if (!rolActual) return;

        setGuardando(true);

        try {
            await eliminar(rolActual.id);
            toast.success('Rol eliminado.');
            setConfirmarBorrar(false);
        } catch (deleteError) {
            toast.error(mensajeError(deleteError, 'No se pudo eliminar el rol.'));
            setConfirmarBorrar(false);
        } finally {
            setGuardando(false);
        }
    };

    if (legacy) {
        return (
            <div className="rounded-2xl border border-admin-warning/30 bg-admin-warning-soft p-6 text-sm font-semibold text-admin-warning">
                El sistema de roles no está disponible en este momento.
            </div>
        );
    }

    if (loading) {
        return (
            <div role="status" aria-label="Cargando roles" className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
                <div className="space-y-3">
                    {[0, 1, 2].map(item => (
                        <div key={item} className="h-20 animate-pulse rounded-2xl bg-admin-surface-2" />
                    ))}
                </div>
                <div className="h-72 animate-pulse rounded-3xl bg-admin-surface-2" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="rounded-2xl border border-admin-danger/30 bg-admin-danger-soft p-6">
                <p className="text-sm font-semibold text-admin-danger">{mensajeError(error, 'No se pudieron cargar los roles.')}</p>
                <button
                    type="button"
                    onClick={cargar}
                    className="mt-3 rounded-xl bg-admin-danger-strong px-4 py-2 text-sm font-bold text-white hover:bg-admin-danger-strong/80"
                >
                    Reintentar
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <h2 className="font-serif text-2xl font-bold text-admin-text">Roles y permisos</h2>
                    <p className="text-sm text-admin-muted">
                        Crea roles y decide qué puede hacer cada uno. Los cambios se aplican al instante.
                    </p>
                </div>
                {puedeCrear && (
                    <button
                        type="button"
                        onClick={abrirCrear}
                        className="flex items-center justify-center gap-2 rounded-xl bg-admin-primary px-4 py-3 font-bold text-white transition hover:bg-admin-primary-hover"
                    >
                        <FaPlus aria-hidden /> Nuevo rol
                    </button>
                )}
            </div>

            <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
                <div className="space-y-3">
                    {roles.map(rol => {
                        const activo = rol.id === seleccionadoId;

                        return (
                            <button
                                key={rol.id}
                                type="button"
                                onClick={() => seleccionar(rol.id)}
                                aria-pressed={activo}
                                className={`w-full rounded-2xl border p-4 text-left transition ${
                                    activo
                                        ? 'border-admin-accent bg-admin-accent-soft shadow-sm'
                                        : 'border-admin-border bg-admin-surface hover:border-admin-border hover:bg-admin-surface-2'
                                }`}
                            >
                                <span className="flex items-center justify-between gap-2">
                                    <span className="font-black text-admin-text">{rol.nombre}</span>
                                    {rol.esSistema && (
                                        <span className="flex items-center gap-1 rounded-full bg-admin-surface px-2 py-0.5 text-[10px] font-bold text-white">
                                            <FaLock aria-hidden size={9} /> Sistema
                                        </span>
                                    )}
                                </span>
                                {rol.descripcion && (
                                    <span className="mt-1 block text-xs text-admin-muted">{rol.descripcion}</span>
                                )}
                                <span className="mt-2 flex items-center gap-3 text-xs font-semibold text-admin-muted">
                                    <span>{rol.permisos.length} permisos</span>
                                    <span className="flex items-center gap-1">
                                        <FaUsers aria-hidden size={10} /> {rol.usuarios} usuario(s)
                                    </span>
                                </span>
                            </button>
                        );
                    })}
                </div>

                <div className="min-w-0 rounded-3xl border border-admin-border bg-admin-surface p-5">
                    {!rolActual ? (
                        <p className="text-sm text-admin-muted">Selecciona un rol para ver sus permisos.</p>
                    ) : (
                        <>
                            <div className="flex flex-col gap-3 border-b border-admin-border pb-4 md:flex-row md:items-center md:justify-between">
                                <div>
                                    <h3 className="font-serif text-xl font-bold text-admin-text">{rolActual.nombre}</h3>
                                    <p className="text-xs text-admin-muted">
                                        {rolActual.descripcion || 'Sin descripción'}
                                    </p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        onClick={abrirEditar}
                                        disabled={!puedeEditar || esSistema}
                                        className="flex items-center gap-2 rounded-xl border border-admin-border px-3 py-2 text-sm font-bold text-admin-text transition hover:bg-admin-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
                                        title={esSistema ? 'El rol de sistema no se edita' : 'Renombrar o cambiar la descripción'}
                                    >
                                        <FaEdit aria-hidden /> Editar
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setConfirmarBorrar(true)}
                                        disabled={!puedeEliminar || esSistema || rolActual.usuarios > 0}
                                        className="flex items-center gap-2 rounded-xl border border-admin-danger/30 px-3 py-2 text-sm font-bold text-admin-danger transition hover:bg-admin-danger-soft disabled:cursor-not-allowed disabled:opacity-40"
                                        title={
                                            esSistema
                                                ? 'El rol de sistema no se borra'
                                                : rolActual.usuarios > 0
                                                    ? 'Reasigna a los usuarios antes de borrarlo'
                                                    : 'Borrar rol'
                                        }
                                    >
                                        <FaTrash aria-hidden /> Borrar
                                    </button>
                                </div>
                            </div>

                            {esSistema && (
                                <div className="mt-4 flex items-start gap-3 rounded-2xl border border-admin-warning/30 bg-admin-warning-soft p-4 text-sm text-admin-warning">
                                    <FaLock className="mt-0.5 shrink-0" aria-hidden />
                                    <p>
                                        El <strong>Superadmin</strong> tiene todos los permisos, incluidos los que
                                        se añadan en el futuro. No se edita para evitar quedarse sin acceso.
                                    </p>
                                </div>
                            )}

                            <div className="mt-4">
                                <PermissionMatrix
                                    permisos={catalogo}
                                    seleccionados={borrador}
                                    onChange={siguientes => {
                                        setBorrador(siguientes);
                                        setDirty(true);
                                    }}
                                    disabled={deshabilitado}
                                />
                            </div>

                            {!esSistema && (
                                <div className="mt-5 flex flex-col-reverse gap-3 border-t border-admin-border pt-4 sm:flex-row sm:items-center sm:justify-between">
                                    <span className="text-sm font-semibold text-admin-muted">
                                        {dirty ? 'Hay cambios sin guardar.' : 'Todo guardado.'}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={guardar}
                                        disabled={!dirty || deshabilitado}
                                        aria-busy={guardando}
                                        className="flex items-center justify-center gap-2 rounded-xl bg-admin-primary px-5 py-3 font-bold text-white transition hover:bg-admin-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        <FaSave aria-hidden /> {guardando ? 'Guardando…' : 'Guardar permisos'}
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {modal && (
                <AccessibleModal
                    onClose={guardando ? () => undefined : () => setModal(null)}
                    labelledBy={titleId}
                    describedBy={descriptionId}
                    className="w-full max-w-md rounded-3xl bg-admin-surface p-6 shadow-2xl"
                >
                    <h3 id={titleId} className="text-xl font-black text-admin-text">
                        {modal === 'crear' ? 'Nuevo rol' : 'Editar rol'}
                    </h3>
                    <p id={descriptionId} className="mt-1 text-sm text-admin-muted">
                        Después podrás marcar sus permisos en la matriz.
                    </p>

                    <form onSubmit={enviarModal} className="mt-5 space-y-4">
                        <div>
                            <label htmlFor="rol-nombre" className="mb-1 block text-sm font-bold text-admin-text">
                                Nombre <span className="text-admin-danger">*</span>
                            </label>
                            <input
                                id="rol-nombre"
                                type="text"
                                value={nombre}
                                onChange={event => setNombre(event.target.value)}
                                required
                                minLength={3}
                                maxLength={60}
                                className="w-full rounded-xl border border-admin-border px-4 py-3 text-sm focus:border-admin-accent focus:outline-none focus:ring-2 focus:ring-admin-accent/20"
                                placeholder="Editor, Marketing, Solo lectura…"
                            />
                        </div>
                        <div>
                            <label htmlFor="rol-descripcion" className="mb-1 block text-sm font-bold text-admin-text">
                                Descripción
                            </label>
                            <input
                                id="rol-descripcion"
                                type="text"
                                value={descripcion}
                                onChange={event => setDescripcion(event.target.value)}
                                maxLength={160}
                                className="w-full rounded-xl border border-admin-border px-4 py-3 text-sm focus:border-admin-accent focus:outline-none focus:ring-2 focus:ring-admin-accent/20"
                                placeholder="Para qué sirve este rol"
                            />
                        </div>

                        {errorModal && (
                            <p role="alert" className="rounded-xl bg-admin-danger-soft px-4 py-3 text-sm font-semibold text-admin-danger">
                                {errorModal}
                            </p>
                        )}

                        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                            <button
                                type="button"
                                onClick={() => setModal(null)}
                                disabled={guardando}
                                className="rounded-xl px-5 py-3 font-bold text-admin-muted transition hover:bg-admin-surface-2 disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={guardando}
                                className="rounded-xl bg-admin-primary px-5 py-3 font-bold text-white transition hover:bg-admin-primary-hover disabled:opacity-60"
                            >
                                {guardando ? 'Guardando…' : 'Guardar'}
                            </button>
                        </div>
                    </form>
                </AccessibleModal>
            )}

            <ConfirmDialog
                open={confirmarBorrar}
                title="Borrar rol"
                description={`Se borrará el rol "${rolActual?.nombre ?? ''}". Esta acción no se puede deshacer.`}
                confirmLabel="Borrar rol"
                loading={guardando}
                onCancel={() => setConfirmarBorrar(false)}
                onConfirm={borrar}
            />

            <ConfirmDialog
                open={verConfirmacionCambio}
                title="Cambios sin guardar"
                description="Si cambias de rol ahora, perderás los permisos que marcaste sin guardar."
                confirmLabel="Cambiar de rol"
                tone="warning"
                onCancel={() => {
                    setVerConfirmacionCambio(false);
                    setPendienteId(null);
                }}
                onConfirm={() => {
                    if (pendienteId) aplicarSeleccion(pendienteId);
                    setVerConfirmacionCambio(false);
                    setPendienteId(null);
                }}
            />
        </div>
    );
};
