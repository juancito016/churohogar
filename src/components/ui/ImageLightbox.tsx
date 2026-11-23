/**
 * Visor de fotos compartido por la web pública y el panel.
 *
 * - Se apoya en `AccessibleModal`: `Escape`, foco atrapado y foco restaurado.
 * - Clic en el fondo negro o en la ✕ cierra; clic en la foto no.
 * - Flechas ‹ › y teclado (← →) cuando hay más de una foto.
 */

import React, { useEffect, useId } from 'react';
import { FaChevronLeft, FaChevronRight, FaTimes } from 'react-icons/fa';
import { AccessibleModal } from './AccessibleModal';

export interface LightboxImage {
    src: string;
    alt?: string;
}

interface ImageLightboxProps {
    images: LightboxImage[];
    index: number;
    onIndexChange: (index: number) => void;
    onClose: () => void;
    title?: string;
}

export const ImageLightbox: React.FC<ImageLightboxProps> = ({
    images,
    index,
    onIndexChange,
    onClose,
    title = 'Fotos del inmueble',
}) => {
    const titleId = useId();
    const total = images.length;
    const actual = total > 0 ? ((index % total) + total) % total : 0;

    const goTo = (delta: number) => {
        if (total < 2) return;
        onIndexChange(((actual + delta) % total + total) % total);
    };

    useEffect(() => {
        if (total < 2) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'ArrowRight') {
                event.preventDefault();
                onIndexChange((actual + 1) % total);
            }
            if (event.key === 'ArrowLeft') {
                event.preventDefault();
                onIndexChange((actual - 1 + total) % total);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [actual, total, onIndexChange]);

    if (total === 0) return null;

    return (
        <AccessibleModal
            onClose={onClose}
            labelledBy={titleId}
            overlayClassName="z-[80] bg-black/90 backdrop-blur-none p-0"
            className="relative flex h-full w-full max-w-none items-center justify-center"
            closeOnBackdrop={false}
        >
            <h2 id={titleId} className="sr-only">{title}</h2>

            <div
                className="absolute inset-0"
                onClick={onClose}
                aria-hidden="true"
            />

            <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar"
                className="absolute right-3 top-3 z-10 rounded-full bg-black/40 p-3 text-white/80 transition hover:bg-black/60 hover:text-white md:right-6 md:top-6"
            >
                <FaTimes size={24} />
            </button>

            {total > 1 && (
                <>
                    <button
                        type="button"
                        onClick={() => goTo(-1)}
                        aria-label="Foto anterior"
                        className="absolute left-2 z-10 rounded-full bg-black/40 p-3 text-white/80 transition hover:bg-black/60 hover:text-white md:left-6"
                    >
                        <FaChevronLeft size={26} />
                    </button>
                    <button
                        type="button"
                        onClick={() => goTo(1)}
                        aria-label="Foto siguiente"
                        className="absolute right-2 z-10 rounded-full bg-black/40 p-3 text-white/80 transition hover:bg-black/60 hover:text-white md:right-6"
                    >
                        <FaChevronRight size={26} />
                    </button>
                </>
            )}

            <img
                src={images[actual].src}
                alt={images[actual].alt || ''}
                onClick={event => event.stopPropagation()}
                className="relative z-[1] max-h-[85vh] max-w-[92vw] select-none rounded-lg object-contain"
            />

            {total > 1 && (
                <div className="absolute bottom-5 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-sm font-bold text-white/85">
                    {actual + 1} / {total}
                </div>
            )}
        </AccessibleModal>
    );
};
