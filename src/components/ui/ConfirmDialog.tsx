/**
 * ADM-32/ADM-33 — Confirmación propia y accesible.
 * Sustituye a `window.confirm` en el panel: título claro, consecuencia y
 * botón con la acción concreta. `Escape` y “Cancelar” cierran.
 */

import React, { useId, useRef } from 'react';
import { FaExclamationTriangle } from 'react-icons/fa';
import { AccessibleModal } from './AccessibleModal';

type Tone = 'danger' | 'warning' | 'primary';

interface ConfirmDialogProps {
    open: boolean;
    title: string;
    description: string;
    confirmLabel?: string;
    cancelLabel?: string;
    tone?: Tone;
    loading?: boolean;
    onCancel: () => void;
    onConfirm: () => void;
}

const TONE_BUTTON: Record<Tone, string> = {
    danger: 'bg-admin-danger-strong hover:bg-admin-danger-strong/80 text-white',
    warning: 'bg-admin-warning-soft0 hover:bg-amber-600 text-white',
    primary: 'bg-admin-primary hover:bg-admin-primary-hover text-white',
};

const TONE_ICON: Record<Tone, string> = {
    danger: 'text-admin-danger bg-admin-danger-soft',
    warning: 'text-admin-warning bg-admin-warning-soft',
    primary: 'text-admin-accent bg-admin-accent-soft',
};

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
    open,
    title,
    description,
    confirmLabel = 'Confirmar',
    cancelLabel = 'Cancelar',
    tone = 'danger',
    loading = false,
    onCancel,
    onConfirm,
}) => {
    const titleId = useId();
    const descriptionId = useId();
    const cancelRef = useRef<HTMLButtonElement>(null);

    if (!open) return null;

    return (
        <AccessibleModal
            onClose={loading ? () => undefined : onCancel}
            labelledBy={titleId}
            describedBy={descriptionId}
            initialFocusRef={cancelRef}
            className="w-full max-w-md rounded-3xl bg-admin-surface p-6 shadow-2xl"
            overlayClassName="z-[90]"
        >
            <div className="flex items-start gap-4">
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${TONE_ICON[tone]}`}>
                    <FaExclamationTriangle aria-hidden />
                </span>
                <div>
                    <h3 id={titleId} className="text-xl font-black text-admin-text">
                        {title}
                    </h3>
                    <p id={descriptionId} className="mt-2 text-sm text-admin-muted">
                        {description}
                    </p>
                </div>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                    ref={cancelRef}
                    type="button"
                    onClick={onCancel}
                    disabled={loading}
                    className="rounded-xl px-5 py-3 font-bold text-admin-muted transition hover:bg-admin-surface-2 disabled:opacity-50"
                >
                    {cancelLabel}
                </button>
                <button
                    type="button"
                    onClick={onConfirm}
                    disabled={loading}
                    aria-busy={loading}
                    className={`rounded-xl px-5 py-3 font-bold transition disabled:opacity-60 ${TONE_BUTTON[tone]}`}
                >
                    {loading ? 'Procesando…' : confirmLabel}
                </button>
            </div>
        </AccessibleModal>
    );
};
