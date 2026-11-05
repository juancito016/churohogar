/**
 * ADM-32 — Modal accesible del panel.
 *
 * - `role="dialog"` + `aria-modal` y `aria-labelledby`/`aria-describedby`.
 * - `Escape` cierra, el foco queda atrapado dentro y vuelve al cerrar.
 * - Bloquea el scroll del fondo mientras está abierto.
 */

import React, { useEffect, useRef } from 'react';

interface AccessibleModalProps {
    onClose: () => void;
    labelledBy: string;
    describedBy?: string;
    children: React.ReactNode;
    className?: string;
    overlayClassName?: string;
    initialFocusRef?: React.RefObject<HTMLElement | null>;
    closeOnBackdrop?: boolean;
}

const FOCUSABLE =
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const AccessibleModal: React.FC<AccessibleModalProps> = ({
    onClose,
    labelledBy,
    describedBy,
    children,
    className = '',
    overlayClassName = '',
    initialFocusRef,
    closeOnBackdrop = true,
}) => {
    const panelRef = useRef<HTMLDivElement>(null);
    const restoreRef = useRef<HTMLElement | null>(null);
    const onCloseRef = useRef(onClose);

    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    useEffect(() => {
        restoreRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

        const panel = panelRef.current;
        if (!panel) return;

        const focusables = () =>
            Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
                element => element.getClientRects().length > 0
            );

        const target = initialFocusRef?.current ?? focusables()[0] ?? panel;
        const frame = requestAnimationFrame(() => target.focus());

        const handleKeyDown = (event: KeyboardEvent) => {
            // Si hay otro modal encima (p. ej. la confirmación de cambios), las
            // teclas las maneja ese; el de abajo no debe cerrarse por detrás.
            const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"]');
            const topDialog = dialogs[dialogs.length - 1];
            if (topDialog && topDialog !== panel) return;

            if (event.key === 'Escape') {
                event.preventDefault();
                onCloseRef.current();
                return;
            }

            if (event.key !== 'Tab') return;

            const items = focusables();
            if (items.length === 0) {
                event.preventDefault();
                panel.focus();
                return;
            }

            const first = items[0];
            const last = items[items.length - 1];
            const active = document.activeElement as HTMLElement | null;

            if (event.shiftKey && (active === first || !panel.contains(active))) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && active === last) {
                event.preventDefault();
                first.focus();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        return () => {
            cancelAnimationFrame(frame);
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = previousOverflow;
            restoreRef.current?.focus();
        };
        // El foco inicial solo se calcula al montar; `onClose` va por referencia.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div
            className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm ${overlayClassName}`}
            onMouseDown={event => {
                if (closeOnBackdrop && event.target === event.currentTarget) onClose();
            }}
        >
            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={labelledBy}
                aria-describedby={describedBy}
                tabIndex={-1}
                className={className}
                onMouseDown={event => event.stopPropagation()}
            >
                {children}
            </div>
        </div>
    );
};
