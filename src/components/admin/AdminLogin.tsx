import React, { useEffect, useState } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { FaEye, FaEyeSlash, FaSpinner } from 'react-icons/fa';
import { supabase } from '../../services/supabaseClient';

interface AdminLoginProps {
    message?: string | null;
    /** `info` para avisos (p. ej. cierre por inactividad) y `error` por defecto. */
    messageTone?: 'error' | 'info';
}

const MAX_ATTEMPTS = 5;
const COOLDOWN_SECONDS = 30;

const translateAuthError = (message: string) => {
    const normalized = message.toLowerCase();

    if (normalized.includes('invalid login credentials')) {
        return 'Email o contraseña incorrectos.';
    }
    if (normalized.includes('email not confirmed')) {
        return 'Debes confirmar tu correo antes de iniciar sesión.';
    }
    if (normalized.includes('too many requests') || normalized.includes('rate limit')) {
        return 'Demasiados intentos. Espera unos minutos antes de volver a intentar.';
    }
    if (normalized.includes('network') || normalized.includes('fetch')) {
        return 'No se pudo conectar. Revisa tu conexión e intenta de nuevo.';
    }

    return 'No se pudo iniciar sesión. Intenta de nuevo.';
};

export const AdminLogin: React.FC<AdminLoginProps> = ({ message, messageTone = 'error' }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [failedAttempts, setFailedAttempts] = useState(0);
    const [cooldown, setCooldown] = useState(0);

    useEffect(() => {
        if (cooldown <= 0) return;

        const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
        return () => clearTimeout(timer);
    }, [cooldown]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (submitting || cooldown > 0) return;

        setError(null);
        setSubmitting(true);

        const { error: authError } = await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
        });

        setSubmitting(false);

        if (authError) {
            const nextAttempts = failedAttempts + 1;
            setFailedAttempts(nextAttempts);

            if (nextAttempts >= MAX_ATTEMPTS) {
                setFailedAttempts(0);
                setCooldown(COOLDOWN_SECONDS);
                setError(`Demasiados intentos fallidos. Espera ${COOLDOWN_SECONDS} segundos antes de volver a intentar.`);
                return;
            }

            setError(translateAuthError(authError.message));
            return;
        }

        setFailedAttempts(0);
        toast.success('Bienvenido');
    };

    const visibleMessage = error ?? message;

    return (
        <main className="admin-shell min-h-screen bg-admin-bg text-admin-text flex items-center justify-center p-4">
            <Toaster
                position="top-right"
                toastOptions={{
                    style: { background: '#1E1916', color: '#F5EFE6', border: '1px solid #3A302A' },
                }}
            />
            <div className="w-full max-w-md overflow-hidden rounded-3xl border border-admin-border bg-admin-surface p-8 shadow-2xl">
                <h2 className="mb-8 text-center font-serif text-3xl font-bold text-admin-accent">Acceso Admin</h2>
                {visibleMessage && (
                    <div
                        role="alert"
                        aria-live="polite"
                        className={`mb-6 rounded-xl border px-4 py-3 text-sm font-semibold ${messageTone === 'info'
                            ? 'border-admin-warning/30 bg-admin-warning-soft text-admin-warning'
                            : 'border-admin-danger/30 bg-admin-danger-soft text-admin-danger'}`}
                    >
                        {visibleMessage}
                    </div>
                )}
                <form className="space-y-6" onSubmit={handleLogin}>
                    <div>
                        <label htmlFor="admin-email" className="block text-sm font-semibold text-admin-text mb-1">Email</label>
                        <input
                            id="admin-email"
                            name="email"
                            type="email"
                            autoComplete="username"
                            required
                            disabled={submitting}
                            value={email}
                            onChange={e => { setEmail(e.target.value); setError(null); }}
                            className="w-full px-4 py-3 border border-admin-border rounded-xl bg-admin-surface-2 text-admin-text placeholder:text-admin-muted focus:outline-none focus:ring-2 focus:ring-admin-accent disabled:opacity-60"
                        />
                    </div>
                    <div>
                        <label htmlFor="admin-password" className="block text-sm font-semibold text-admin-text mb-1">Contraseña</label>
                        <div className="relative">
                            <input
                                id="admin-password"
                                name="password"
                                type={showPassword ? 'text' : 'password'}
                                autoComplete="current-password"
                                required
                                disabled={submitting}
                                value={password}
                                onChange={e => { setPassword(e.target.value); setError(null); }}
                                className="w-full px-4 py-3 pr-12 border border-admin-border rounded-xl bg-admin-surface-2 text-admin-text placeholder:text-admin-muted focus:outline-none focus:ring-2 focus:ring-admin-accent disabled:opacity-60"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(prev => !prev)}
                                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                                aria-pressed={showPassword}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-admin-muted hover:text-admin-accent rounded-lg"
                            >
                                {showPassword ? <FaEyeSlash /> : <FaEye />}
                            </button>
                        </div>
                    </div>
                    <button
                        type="submit"
                        disabled={submitting || cooldown > 0}
                        aria-busy={submitting}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-admin-primary px-4 py-3 font-bold text-white transition hover:bg-admin-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {submitting && <FaSpinner className="animate-spin" />}
                        {cooldown > 0 ? `Espera ${cooldown}s` : submitting ? 'Ingresando...' : 'Ingresar'}
                    </button>
                </form>
            </div>
        </main>
    );
};
