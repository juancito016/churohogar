/**
 * ADM-41 — Alta y edición de un usuario del panel.
 *
 * En alta pide email y contraseña (la cuenta nace confirmada, sin correo).
 * En edición permite cambiar email, roles y, opcionalmente, la contraseña.
 * El propio usuario no puede cambiarse los roles.
 */

import React, { useId, useRef, useState } from 'react';
import { FaEye, FaEyeSlash, FaSyncAlt } from 'react-icons/fa';
import { AccessibleModal } from '../ui/AccessibleModal';
import { mensajeError } from '../../utils/errors';
import type { NuevoUsuario, RolAdmin, UsuarioAdmin } from '../../types/rbac';

interface UserFormModalProps {
    usuario: UsuarioAdmin | null;
    roles: RolAdmin[];
    puedeAsignarRoles: boolean;
    onClose: () => void;
    onCrear: (data: NuevoUsuario) => Promise<void>;
    onGuardar: (
        usuario: UsuarioAdmin,
        email: string,
        roleIds: string[],
        password?: string
    ) => Promise<void>;
}

const generarPassword = () => {
    const caracteres = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
    const valores = new Uint32Array(14);
    crypto.getRandomValues(valores);
    return Array.from(valores, valor => caracteres[valor % caracteres.length]).join('');
};

const esEmail = (valor: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(valor.trim());

export const UserFormModal: React.FC<UserFormModalProps> = ({
    usuario,
    roles,
    puedeAsignarRoles,
    onClose,
    onCrear,
    onGuardar,
}) => {
    const titleId = useId();
    const descriptionId = useId();
    const emailRef = useRef<HTMLInputElement>(null);
    const esAlta = !usuario;
    const rolesBloqueados = Boolean(usuario?.esYo) || !puedeAsignarRoles;

    const [nombre, setNombre] = useState(usuario?.nombre ?? '');
    const [email, setEmail] = useState(usuario?.email ?? '');
    const [password, setPassword] = useState('');
    const [confirmacion, setConfirmacion] = useState('');
    const [verPassword, setVerPassword] = useState(false);
    const [roleIds, setRoleIds] = useState<string[]>(usuario?.roles.map(rol => rol.id) ?? []);
    const [error, setError] = useState<string | null>(null);
    const [guardando, setGuardando] = useState(false);

    const toggleRol = (id: string) => {
        if (rolesBloqueados) return;

        setRoleIds(prev => (
            prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
        ));
    };

    const usarGenerada = () => {
        const nueva = generarPassword();
        setPassword(nueva);
        setConfirmacion(nueva);
        setVerPassword(true);
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError(null);

        if (!esEmail(email)) {
            setError('Escribe un email válido.');
            return;
        }

        if (esAlta) {
            if (password.length < 8) {
                setError('La contraseña debe tener al menos 8 caracteres.');
                return;
            }
            if (password !== confirmacion) {
                setError('La confirmación no coincide con la contraseña.');
                return;
            }
            if (roleIds.length === 0) {
                setError('Asigna al menos un rol.');
                return;
            }
        } else if (password && password.length < 8) {
            setError('La nueva contraseña debe tener al menos 8 caracteres.');
            return;
        }

        setGuardando(true);

        try {
            if (esAlta) {
                await onCrear({
                    email: email.trim().toLowerCase(),
                    password,
                    nombre: nombre.trim(),
                    roleIds,
                });
            } else if (usuario) {
                await onGuardar(usuario, email, roleIds, password || undefined);
            }

            onClose();
        } catch (submitError) {
            setError(mensajeError(submitError, 'No se pudo guardar el usuario.'));
        } finally {
            setGuardando(false);
        }
    };

    return (
        <AccessibleModal
            onClose={guardando ? () => undefined : onClose}
            labelledBy={titleId}
            describedBy={descriptionId}
            initialFocusRef={emailRef}
            className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl bg-admin-surface p-6 shadow-2xl"
        >
            <h3 id={titleId} className="text-2xl font-black text-admin-text">
                {esAlta ? 'Nuevo administrador' : 'Editar administrador'}
            </h3>
            <p id={descriptionId} className="mt-1 text-sm text-admin-muted">
                {esAlta
                    ? 'La cuenta se crea confirmada: podrá entrar con el email y la contraseña que definas.'
                    : 'Cambia el email, los roles o la contraseña. Los roles del Superadmin no se editan.'}
            </p>

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                <div>
                    <label htmlFor="rbac-nombre" className="mb-1 block text-sm font-bold text-admin-text">
                        Nombre
                    </label>
                    <input
                        id="rbac-nombre"
                        type="text"
                        value={nombre}
                        onChange={event => setNombre(event.target.value)}
                        maxLength={120}
                        autoComplete="off"
                        className="w-full rounded-xl border border-admin-border px-4 py-3 text-sm focus:border-admin-accent focus:outline-none focus:ring-2 focus:ring-admin-accent/20"
                        placeholder="Nombre para identificar a la persona"
                    />
                </div>

                <div>
                    <label htmlFor="rbac-email" className="mb-1 block text-sm font-bold text-admin-text">
                        Email <span className="text-admin-danger">*</span>
                    </label>
                    <input
                        ref={emailRef}
                        id="rbac-email"
                        type="email"
                        value={email}
                        onChange={event => setEmail(event.target.value)}
                        required
                        autoComplete="email"
                        className="w-full rounded-xl border border-admin-border px-4 py-3 text-sm focus:border-admin-accent focus:outline-none focus:ring-2 focus:ring-admin-accent/20"
                        placeholder="persona@correo.com"
                    />
                </div>

                <div>
                    <div className="mb-1 flex items-center justify-between gap-2">
                        <label htmlFor="rbac-password" className="block text-sm font-bold text-admin-text">
                            {esAlta ? 'Contraseña' : 'Nueva contraseña (opcional)'}
                            {esAlta && <span className="text-admin-danger"> *</span>}
                        </label>
                        <button
                            type="button"
                            onClick={usarGenerada}
                            className="flex items-center gap-1 text-xs font-bold text-admin-accent hover:underline"
                        >
                            <FaSyncAlt aria-hidden /> Generar
                        </button>
                    </div>
                    <div className="relative">
                        <input
                            id="rbac-password"
                            type={verPassword ? 'text' : 'password'}
                            value={password}
                            onChange={event => setPassword(event.target.value)}
                            autoComplete="new-password"
                            minLength={8}
                            className="w-full rounded-xl border border-admin-border px-4 py-3 pr-12 text-sm focus:border-admin-accent focus:outline-none focus:ring-2 focus:ring-admin-accent/20"
                            placeholder={esAlta ? 'Mínimo 8 caracteres' : 'Déjala vacía para no cambiarla'}
                        />
                        <button
                            type="button"
                            onClick={() => setVerPassword(prev => !prev)}
                            aria-label={verPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-admin-muted hover:text-admin-text"
                        >
                            {verPassword ? <FaEyeSlash aria-hidden /> : <FaEye aria-hidden />}
                        </button>
                    </div>
                    <p className="mt-1 text-[11px] text-admin-muted">
                        {esAlta
                            ? 'Se muestra una sola vez: compártela por un canal seguro.'
                            : 'Si la defines, el usuario deberá usar la nueva en su próximo inicio.'}
                    </p>
                </div>

                {esAlta && (
                    <div>
                        <label htmlFor="rbac-password-confirm" className="mb-1 block text-sm font-bold text-admin-text">
                            Repetir contraseña <span className="text-admin-danger">*</span>
                        </label>
                        <input
                            id="rbac-password-confirm"
                            type={verPassword ? 'text' : 'password'}
                            value={confirmacion}
                            onChange={event => setConfirmacion(event.target.value)}
                            autoComplete="new-password"
                            className="w-full rounded-xl border border-admin-border px-4 py-3 text-sm focus:border-admin-accent focus:outline-none focus:ring-2 focus:ring-admin-accent/20"
                        />
                    </div>
                )}

                <fieldset className="rounded-2xl border border-admin-border p-4">
                    <legend className="px-2 text-sm font-black text-admin-text">Roles</legend>
                    {roles.length === 0 ? (
                        <p className="text-sm text-admin-muted">No hay roles disponibles.</p>
                    ) : (
                        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                            {roles.map(rol => (
                                <label key={rol.id} className="flex items-start gap-2 text-sm">
                                    <input
                                        type="checkbox"
                                        checked={roleIds.includes(rol.id)}
                                        onChange={() => toggleRol(rol.id)}
                                        disabled={rolesBloqueados}
                                        className="mt-0.5 h-4 w-4 accent-admin-accent"
                                    />
                                    <span>
                                        <span className="font-semibold text-admin-text">{rol.nombre}</span>
                                        {rol.esSistema && (
                                            <span className="ml-2 rounded-full bg-admin-accent-soft px-2 py-0.5 text-[10px] font-bold text-admin-accent">
                                                Sistema
                                            </span>
                                        )}
                                    </span>
                                </label>
                            ))}
                        </div>
                    )}
                    {usuario?.esYo && (
                        <p className="mt-2 text-xs font-semibold text-admin-warning">
                            No puedes cambiar tus propios roles.
                        </p>
                    )}
                </fieldset>

                {error && (
                    <p role="alert" className="rounded-xl bg-admin-danger-soft px-4 py-3 text-sm font-semibold text-admin-danger">
                        {error}
                    </p>
                )}

                <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={guardando}
                        className="rounded-xl px-5 py-3 font-bold text-admin-muted transition hover:bg-admin-surface-2 disabled:opacity-50"
                    >
                        Cancelar
                    </button>
                    <button
                        type="submit"
                        disabled={guardando}
                        aria-busy={guardando}
                        className="rounded-xl bg-admin-primary px-5 py-3 font-bold text-white transition hover:bg-admin-primary-hover disabled:opacity-60"
                    >
                        {guardando ? 'Guardando…' : esAlta ? 'Crear usuario' : 'Guardar cambios'}
                    </button>
                </div>
            </form>
        </AccessibleModal>
    );
};
