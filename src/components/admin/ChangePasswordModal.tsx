/**
 * ADM-05 — Cambio de contraseña del administrador logueado.
 *
 * No usa SMTP: verifica la contraseña actual con `signInWithPassword` (mismo
 * email de la sesión) y luego la cambia con `updateUser`. La *recuperación* por
 * correo queda fuera de alcance por falta de SMTP propio.
 */

import React, { useId, useRef, useState } from 'react';
import { FaEye, FaEyeSlash, FaSpinner } from 'react-icons/fa';
import { supabase } from '../../services/supabaseClient';
import { AccessibleModal } from '../ui/AccessibleModal';

interface ChangePasswordModalProps {
    email: string;
    onClose: () => void;
    onSuccess: () => void;
}

const MIN_LENGTH = 6;

const translateAuthError = (error: { message?: string } | null): string => {
    const normalized = (error?.message ?? '').toLowerCase();

    if (normalized.includes('invalid login credentials')) {
        return 'La contraseña actual es incorrecta.';
    }
    if (normalized.includes('new password should be different') || normalized.includes('password should be different')) {
        return 'La nueva contraseña debe ser distinta de la actual.';
    }
    if (normalized.includes('at least') || normalized.includes('password should be')) {
        return `La contraseña debe tener al menos ${MIN_LENGTH} caracteres.`;
    }
    if (normalized.includes('too many requests') || normalized.includes('rate limit')) {
        return 'Demasiados intentos. Espera unos minutos antes de volver a intentar.';
    }
    if (normalized.includes('network') || normalized.includes('fetch')) {
        return 'No se pudo conectar. Revisa tu conexión e intenta de nuevo.';
    }

    return 'No se pudo cambiar la contraseña. Intenta de nuevo.';
};

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({
    email,
    onClose,
    onSuccess,
}) => {
    const titleId = useId();
    const descriptionId = useId();
    const firstFieldRef = useRef<HTMLInputElement>(null);

    const [current, setCurrent] = useState('');
    const [next, setNext] = useState('');
    const [confirm, setConfirm] = useState('');
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNext, setShowNext] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const reset = () => {
        setCurrent('');
        setNext('');
        setConfirm('');
        setShowCurrent(false);
        setShowNext(false);
        setError(null);
    };

    const handleClose = () => {
        if (loading) return;
        reset();
        onClose();
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (loading) return;
        setError(null);

        if (!current || !next || !confirm) {
            setError('Completa los tres campos para continuar.');
            return;
        }
        if (next.length < MIN_LENGTH) {
            setError(`La nueva contraseña debe tener al menos ${MIN_LENGTH} caracteres.`);
            return;
        }
        if (next !== confirm) {
            setError('La confirmación no coincide con la nueva contraseña.');
            return;
        }
        if (next === current) {
            setError('La nueva contraseña debe ser distinta de la actual.');
            return;
        }

        setLoading(true);
        try {
            const { error: authError } = await supabase.auth.signInWithPassword({
                email,
                password: current,
            });
            if (authError) {
                setError(translateAuthError(authError));
                return;
            }

            const { error: updateError } = await supabase.auth.updateUser({ password: next });
            if (updateError) {
                setError(translateAuthError(updateError));
                return;
            }

            reset();
            onSuccess();
        } catch {
            setError('No se pudo conectar. Revisa tu conexión e intenta de nuevo.');
        } finally {
            setLoading(false);
        }
    };

    const inputClass =
        'w-full rounded-xl border border-admin-border bg-admin-surface px-4 py-3 text-admin-text outline-none transition focus:border-admin-accent focus:ring-2 focus:ring-admin-accent/20';

    return (
        <AccessibleModal
            onClose={handleClose}
            labelledBy={titleId}
            describedBy={descriptionId}
            initialFocusRef={firstFieldRef}
            className="w-full max-w-md rounded-3xl bg-admin-surface p-6 shadow-2xl"
        >
            <h3 id={titleId} className="text-xl font-black text-admin-text">
                Cambiar contraseña
            </h3>
            <p id={descriptionId} className="mt-1 text-sm text-admin-muted">
                Para <strong>{email}</strong>. Verifica tu contraseña actual y elige una nueva.
            </p>

            <form onSubmit={handleSubmit} className="mt-5 space-y-4" noValidate>
                <div>
                    <label htmlFor="cp-current" className="mb-1 block text-sm font-semibold text-admin-text">
                        Contraseña actual
                    </label>
                    <div className="relative">
                        <input
                            ref={firstFieldRef}
                            id="cp-current"
                            type={showCurrent ? 'text' : 'password'}
                            value={current}
                            onChange={event => setCurrent(event.target.value)}
                            autoComplete="current-password"
                            className={inputClass}
                        />
                        <button
                            type="button"
                            onClick={() => setShowCurrent(prev => !prev)}
                            aria-label={showCurrent ? 'Ocultar contraseña actual' : 'Mostrar contraseña actual'}
                            className="absolute inset-y-0 right-0 flex items-center px-3 text-admin-muted hover:text-admin-muted"
                        >
                            {showCurrent ? <FaEyeSlash /> : <FaEye />}
                        </button>
                    </div>
                </div>

                <div>
                    <label htmlFor="cp-next" className="mb-1 block text-sm font-semibold text-admin-text">
                        Nueva contraseña
                    </label>
                    <div className="relative">
                        <input
                            id="cp-next"
                            type={showNext ? 'text' : 'password'}
                            value={next}
                            onChange={event => setNext(event.target.value)}
                            autoComplete="new-password"
                            className={inputClass}
                        />
                        <button
                            type="button"
                            onClick={() => setShowNext(prev => !prev)}
                            aria-label={showNext ? 'Ocultar nueva contraseña' : 'Mostrar nueva contraseña'}
                            className="absolute inset-y-0 right-0 flex items-center px-3 text-admin-muted hover:text-admin-muted"
                        >
                            {showNext ? <FaEyeSlash /> : <FaEye />}
                        </button>
                    </div>
                    <p className="mt-1 text-xs text-admin-muted">Mínimo {MIN_LENGTH} caracteres.</p>
                </div>

                <div>
                    <label htmlFor="cp-confirm" className="mb-1 block text-sm font-semibold text-admin-text">
                        Confirmar nueva contraseña
                    </label>
                    <input
                        id="cp-confirm"
                        type={showNext ? 'text' : 'password'}
                        value={confirm}
                        onChange={event => setConfirm(event.target.value)}
                        autoComplete="new-password"
                        className={inputClass}
                    />
                </div>

                {error && (
                    <div role="alert" aria-live="polite" className="rounded-xl border border-admin-danger/30 bg-admin-danger-soft px-4 py-3 text-sm font-semibold text-admin-danger">
                        {error}
                    </div>
                )}

                <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
                    <button
                        type="button"
                        onClick={handleClose}
                        disabled={loading}
                        className="rounded-xl px-5 py-3 font-bold text-admin-muted transition hover:bg-admin-surface-2 disabled:opacity-60"
                    >
                        Cancelar
                    </button>
                    <button
                        type="submit"
                        disabled={loading}
                        aria-busy={loading}
                        className="flex items-center justify-center gap-2 rounded-xl bg-admin-primary px-5 py-3 font-bold text-white transition hover:bg-admin-primary-hover disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        {loading && <FaSpinner className="animate-spin" />}
                        {loading ? 'Cambiando...' : 'Guardar contraseña'}
                    </button>
                </div>
            </form>
        </AccessibleModal>
    );
};
