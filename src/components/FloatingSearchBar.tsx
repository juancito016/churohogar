/**
 * Píldora de búsqueda flotante.
 * - Es la misma píldora del hero (mismas clases), pero fija bajo el navbar.
 * - Solo aparece cuando el visitante ya pasó filas de resultados: así no tapa el hero
 *   ni las primeras tarjetas, y sigue disponible al fondo del listado.
 * - Respeta el modo activo (D13): en modo texto ofrece el campo de búsqueda y el atajo
 *   a filtros; en modo filtros ofrece el resumen y el atajo para cambiar de filtros,
 *   sin un input de texto suelto que cambiaría de modo sin querer.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
    FaSearch, FaSlidersH, FaArrowRight, FaTimes, FaMagic,
    FaChevronDown, FaCheck, FaTag, FaKey,
} from 'react-icons/fa';

interface FloatingSearchBarProps {
    /** Modo actual de la búsqueda: texto libre o filtros. */
    mode: 'text' | 'filters';
    /** Texto de la búsqueda aplicada; se sincroniza al cambiar de búsqueda. */
    query: string;
    /** Nº de filtros activos, para el resumen del modo filtros. */
    filterCount: number;
    /** Operación aplicada (Venta o Alquiler); el flotante permite cambiarla. */
    operacion: 'Venta' | 'Alquiler';
    onChangeOperacion: (operacion: 'Venta' | 'Alquiler') => void;
    onSearch: (text: string) => void;
    /** Lleva a la píldora del hero y abre los filtros. */
    onOpenFilters: () => void;
    /** Lleva a la píldora del hero, activa la búsqueda inteligente y enfoca el campo. */
    onEnableSmartSearch: () => void;
}

/** Filas de resultados que hay que dejar atrás: 4 en escritorio y 2 en móvil. */
const rowsBeforeShowing = (width: number) => (width < 640 ? 2 : 4);
/** Columnas de la rejilla según el ancho (1 en móvil, 3 desde `sm`). */
const columnsAt = (width: number) => (width < 640 ? 1 : 3);

export const FloatingSearchBar: React.FC<FloatingSearchBarProps> = ({
    mode,
    query,
    filterCount,
    operacion,
    onChangeOperacion,
    onSearch,
    onOpenFilters,
    onEnableSmartSearch,
}) => {
    const [visible, setVisible] = useState(false);
    const [term, setTerm] = useState(query);
    // Mismo patrón que el hero: desplegable en escritorio, dos píldoras en móvil.
    const [showOperacion, setShowOperacion] = useState(false);
    const operacionPickerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!showOperacion) return;
        const close = (event: MouseEvent) => {
            if (operacionPickerRef.current && !operacionPickerRef.current.contains(event.target as Node)) {
                setShowOperacion(false);
            }
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setShowOperacion(false);
        };
        document.addEventListener('mousedown', close);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', close);
            document.removeEventListener('keydown', onKey);
        };
    }, [showOperacion]);
    const [compactPlaceholder] = useState(
        () => typeof window !== 'undefined' && window.matchMedia('(max-width: 420px)').matches
    );

    useEffect(() => {
        setTerm(query);
    }, [query]);

    useEffect(() => {
        const update = () => {
            const grid = document.getElementById('inmuebles-grid');
            if (!grid) {
                setVisible(false);
                return;
            }

            const gridTop = grid.getBoundingClientRect().top + window.scrollY;
            // De vuelta en el hero o en la cabecera de resultados: la píldora del hero ya sirve.
            if (window.scrollY < gridTop - 100) {
                setVisible(false);
                return;
            }

            const cards = grid.querySelectorAll('article');
            if (cards.length === 0) {
                setVisible(false);
                return;
            }

            // Se mide la última tarjeta de las primeras filas (1 columna en móvil, 3 en
            // escritorio): cuando queda por encima de la pantalla, el visitante ya está
            // leyendo resultados y necesita buscar otra vez sin subir.
            const rowsPassed = Math.min(
                rowsBeforeShowing(window.innerWidth) * columnsAt(window.innerWidth),
                cards.length
            );
            const pastRows = cards[rowsPassed - 1].getBoundingClientRect().bottom < 0;
            // Con pocos resultados la página es corta: al llegar al final también se ofrece.
            const atEnd = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 200;

            if (pastRows || atEnd) setVisible(true);
        };

        update();
        window.addEventListener('scroll', update, { passive: true });
        window.addEventListener('resize', update);

        return () => {
            window.removeEventListener('scroll', update);
            window.removeEventListener('resize', update);
        };
    }, []);

    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault();
        const text = term.trim();
        if (text.length < 3) return;
        onSearch(text);
    };

    const tabIndex = visible ? 0 : -1;
    const isTextMode = mode === 'text';

    return (
        <div
            id="floating-search"
            aria-hidden={!visible}
            className={`fixed left-1/2 z-40 w-[calc(100%-2rem)] max-w-[940px] -translate-x-1/2 transition-all duration-300 ${visible
                ? 'top-[76px] md:top-[96px] translate-y-0 opacity-100'
                : 'top-[64px] md:top-[84px] -translate-y-2 opacity-0 pointer-events-none'
                }`}
        >
            {isTextMode ? (
                <form
                    role="search"
                    onSubmit={handleSubmit}
                    className="bg-white/85 backdrop-blur-xl p-2.5 md:p-3.5 rounded-[38px] md:rounded-[50px] shadow-ideal-pill border border-white/70"
                >
                    <div className="flex items-center gap-1.5 px-1 md:px-2">
                        <FaSearch className="text-accent shrink-0" size={14} aria-hidden />
                        <input
                            type="text"
                            id="floating-query"
                            name="floating_query"
                            value={term}
                            onChange={(event) => setTerm(event.target.value)}
                            aria-label="Buscar inmuebles de nuevo"
                            placeholder={compactPlaceholder ? 'Casa con jardín…' : 'Ej.: casa con jardín en San Blas, hasta $80.000'}
                            autoComplete="off"
                            tabIndex={tabIndex}
                            className="w-full min-w-0 bg-transparent py-2.5 text-[14px] md:text-[15px] font-medium text-ink-soft placeholder-gray-400 focus:outline-none"
                        />
                        {term && (
                            <button
                                type="button"
                                onClick={() => setTerm('')}
                                aria-label="Borrar texto"
                                tabIndex={tabIndex}
                                className="p-2 text-gray-400 hover:text-primary-dark transition-colors shrink-0"
                            >
                                <FaTimes size={11} />
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={onOpenFilters}
                            aria-label="Cambiar a búsqueda con filtros"
                            title="Cambiar a búsqueda con filtros"
                            tabIndex={tabIndex}
                            className="bg-crema/90 hover:bg-crema-dark text-ink-soft p-3 rounded-full transition-colors shrink-0"
                        >
                            <FaSlidersH size={15} />
                        </button>
                        <button
                            type="submit"
                            tabIndex={tabIndex}
                            className="bg-primary-dark hover:bg-black text-white font-bold text-[11px] uppercase tracking-widest py-3 px-4 md:px-5 rounded-full transition-all duration-200 flex items-center justify-center gap-2 active:scale-95 shrink-0"
                        >
                            Buscar <FaArrowRight size={10} className="opacity-90" />
                        </button>
                    </div>
                </form>
            ) : (
                <div className="bg-white/85 backdrop-blur-xl p-2.5 md:p-3.5 rounded-[38px] md:rounded-[50px] shadow-ideal-pill border border-white/70">
                    <div className="flex items-center gap-1.5 px-1 md:px-2">
                        <div role="group" aria-label="Operación" className="bg-crema/90 rounded-full p-1 flex items-center gap-0.5 shrink-0 xl:hidden">
                            {(['Venta', 'Alquiler'] as const).map((op) => (
                                <button
                                    key={op}
                                    type="button"
                                    onClick={() => onChangeOperacion(op)}
                                    aria-pressed={operacion === op}
                                    tabIndex={tabIndex}
                                    className={`min-h-[36px] px-2.5 md:px-3 rounded-full text-[10.5px] md:text-[11px] font-bold uppercase tracking-wider transition-colors ${operacion === op
                                        ? 'bg-primary-dark text-white shadow'
                                        : 'text-ink-soft hover:bg-crema-dark'
                                        }`}
                                >
                                    {op}
                                </button>
                            ))}
                        </div>
                        <div className="hidden xl:block relative shrink-0" ref={operacionPickerRef}>
                            <button
                                type="button"
                                onClick={() => setShowOperacion(prev => !prev)}
                                onMouseDown={(e) => e.stopPropagation()}
                                aria-haspopup="listbox"
                                aria-expanded={showOperacion}
                                aria-label={`Operación: ${operacion}. Cambiar`}
                                tabIndex={tabIndex}
                                className="min-h-[36px] pl-3 pr-2.5 rounded-full bg-crema/90 hover:bg-crema-dark text-ink-soft flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider transition-colors"
                            >
                                {operacion === 'Alquiler'
                                    ? <FaKey size={11} className="text-accent" aria-hidden />
                                    : <FaTag size={11} className="text-accent" aria-hidden />}
                                {operacion}
                                <FaChevronDown size={9} className="text-accent/80" aria-hidden />
                            </button>
                            {showOperacion && (
                                <div role="listbox" aria-label="Operación" className="absolute left-0 z-50 mt-2 w-full min-w-[132px] bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden animate-fadeIn">
                                    {(['Venta', 'Alquiler'] as const).map((op) => {
                                        const Icon = op === 'Alquiler' ? FaKey : FaTag;
                                        return (
                                            <div
                                                key={op}
                                                role="option"
                                                aria-selected={operacion === op}
                                                onClick={() => {
                                                    onChangeOperacion(op);
                                                    setShowOperacion(false);
                                                }}
                                                className={`p-3 hover:bg-crema cursor-pointer flex items-center gap-3 text-[13px] text-gray-700 font-semibold transition-colors ${operacion === op ? 'bg-crema text-primary-dark font-bold' : ''}`}
                                            >
                                                <Icon size={12} className="text-accent" aria-hidden />
                                                <span>{op}</span>
                                                {operacion === op && <FaCheck size={10} className="ml-auto text-primary-dark" />}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={onEnableSmartSearch}
                            aria-label="Buscar describiendo lo que necesitas"
                            title="Buscar describiendo lo que necesitas"
                            tabIndex={tabIndex}
                            className="bg-crema/90 hover:bg-crema-dark text-ink-soft px-3 py-3 rounded-full transition-colors shrink-0 flex items-center gap-2"
                        >
                            <FaMagic size={12} className="text-accent" aria-hidden />
                            <span className="hidden lg:inline text-[11px] md:text-[12px] font-bold uppercase tracking-wider">Describir</span>
                        </button>
                        <button
                            type="button"
                            onClick={onOpenFilters}
                            tabIndex={tabIndex}
                            className="ml-auto bg-primary-dark hover:bg-black text-white font-bold text-[11px] uppercase tracking-widest py-3 px-3 md:px-5 rounded-full transition-all duration-200 flex items-center justify-center gap-2 active:scale-95 shrink-0"
                        >
                            <FaSlidersH size={12} className="opacity-90" aria-hidden />
                            {filterCount > 0 ? `Filtros · ${filterCount}` : 'Filtros'}
                            <FaArrowRight size={10} className="opacity-90 hidden sm:inline" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
