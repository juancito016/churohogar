import React from 'react';

interface SpinnerProps {
    /** Texto que se anuncia a lectores de pantalla. */
    label?: string;
    size?: number;
    className?: string;
}

/**
 * Spinner circular para estados de carga. Se usa dentro del listado para no
 * borrar los resultados ya visibles mientras llega la búsqueda nueva.
 */
export const Spinner: React.FC<SpinnerProps> = ({ label = 'Cargando…', size = 18, className = '' }) => (
    <span role="status" aria-live="polite" className={`inline-flex items-center gap-2 ${className}`}>
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            className="animate-spin text-accent"
        >
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.2" />
            <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
        <span className="sr-only">{label}</span>
    </span>
);
