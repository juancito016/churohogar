/**
 * SearchHero Component - Efecto 3D Isométrico con Tarjeta de Fondo (Pulido)
 * - La casa sobresale de la tarjeta hacia derecha y abajo.
 * - Fondo de tarjeta con la misma imagen fondo.webp pero en otro ángulo
 * - Totalmente responsive
 * - En móvil: barra de búsqueda + botón de filtro con despliegue suave y cierre al hacer clic fuera
 */

import React, { useState, useEffect, useRef } from 'react';
import { useLocationManager } from '../hooks/useLocationManager';
import {
    FaMapMarkerAlt, FaMap, FaChevronDown,
    FaArrowRight, FaDollarSign, FaCheck, FaHome, FaBuilding,
    FaLandmark, FaChevronRight, FaSpinner, FaTimes, FaTrashAlt, FaSlidersH, FaSearch,
    FaMagic, FaTag, FaKey
} from 'react-icons/fa';
import portadaUrl1 from './imagenes/casao.webp';
import fondotarjetaUrl from './imagenes/fondotarjeta.webp';

interface SearchHeroProps {
    onSearch: (filters: any, query?: string, options?: { scrollToResults?: boolean }) => void;
    initialFilters?: any;
    /** Texto de la búsqueda inteligente que ya está aplicado (se conserva al remontar). */
    initialQuery?: string;
    /** Permite ocultar el chip si la función está desactivada. */
    smartSearchEnabled?: boolean;
    /** Modo actual de la píldora: texto (inteligente) o filtros. Lo controla la página. */
    smartSearch?: boolean;
    onSmartSearchChange?: (value: boolean) => void;
    /** Cambia de valor para abrir los filtros desde fuera (píldora flotante). */
    openFiltersToken?: number;
    /** Cambia de valor para enfocar el campo de texto desde fuera. */
    focusSmartToken?: number;
}

export const SearchHero: React.FC<SearchHeroProps> = ({
    onSearch,
    initialFilters = {},
    initialQuery = '',
    smartSearchEnabled = true,
    smartSearch = false,
    onSmartSearchChange,
    openFiltersToken = 0,
    focusSmartToken = 0,
}) => {
    // Refs
    const locationPickerRef = useRef<HTMLDivElement>(null);
    const budgetPickerRef = useRef<HTMLDivElement>(null);
    const tipoPropiedadPickerRef = useRef<HTMLDivElement>(null);
    const operacionPickerRef = useRef<HTMLDivElement>(null);
    const filtroContainerRef = useRef<HTMLDivElement>(null);
    const mobileBarRef = useRef<HTMLDivElement>(null); // referencia a la barra de búsqueda móvil
    const smartInputRef = useRef<HTMLInputElement>(null);
    const smartChipRef = useRef<HTMLButtonElement>(null);

    // Estados originales (sin cambios)
    const { departamentos, ciudades, isLoadingCiudades, getCiudadesByDepto, fetchDepartamentos } = useLocationManager();
    const [tipoPropiedad, setTipoPropiedad] = useState(initialFilters.tipo_propiedad || '');
    // Venta y alquiler son ejes distintos del tipo: la moneda y los presets cambian con la operación.
    const [operacion, setOperacion] = useState<'Venta' | 'Alquiler'>(
        initialFilters.operacion === 'Alquiler' ? 'Alquiler' : 'Venta'
    );
    const [selectedDepto, setSelectedDepto] = useState(initialFilters.departamento || '');
    const [selectedCiudad, setSelectedCiudad] = useState(initialFilters.ciudad || '');
    const [precioMin, setPrecioMin] = useState(initialFilters.precio_min || '');
    const [precioMax, setPrecioMax] = useState(initialFilters.precio_max || '');
    const [showLocationPicker, setShowLocationPicker] = useState(false);
    const [showBudgetPicker, setShowBudgetPicker] = useState(false);
    const [showTipoPropiedadPicker, setShowTipoPropiedadPicker] = useState(false);
    // En escritorio la operación es un desplegable; en móvil, dos píldoras.
    const [showOperacionPicker, setShowOperacionPicker] = useState(false);
    const [locationStep, setLocationStep] = useState<'deptos' | 'ciudades'>('deptos');
    const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
    // Búsqueda inteligente: si hay texto en la URL, la píldora arranca en ese modo.
    const [query, setQuery] = useState(initialQuery);
    const setSmartSearch = (value: boolean) => onSmartSearchChange?.(value);
    // En pantallas muy estrechas el campo comparte fila con dos botones: acortamos la pista.
    const [compactPlaceholder] = useState(
        () => typeof window !== 'undefined' && window.matchMedia('(max-width: 420px)').matches
    );
    
    // Mostrar overflow cuando cualquier dropdown esté abierto para evitar recorte
    const anyDropdownOpen = showBudgetPicker || showLocationPicker || showTipoPropiedadPicker || showOperacionPicker;

    // Sincroniza la píldora con la búsqueda aplicada: si se quita el texto
    // (por ejemplo con “Volver al listado”), vuelve el modo filtros.
    useEffect(() => {
        setQuery(initialQuery);
    }, [initialQuery]);

    // La píldora flotante puede pedir abrir los filtros o enfocar el texto.
    useEffect(() => {
        if (!openFiltersToken) return;
        setMobileFiltersOpen(true);
        const timer = setTimeout(() => {
            filtroContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 80);
        return () => clearTimeout(timer);
    }, [openFiltersToken]);

    useEffect(() => {
        if (!focusSmartToken) return;
        const timer = setTimeout(() => smartInputRef.current?.focus({ preventScroll: true }), 240);
        return () => clearTimeout(timer);
    }, [focusSmartToken]);
    // Cerrar popovers al hacer clic fuera (original)
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (locationPickerRef.current && !locationPickerRef.current.contains(event.target as Node)) {
                setShowLocationPicker(false);
            }
            if (budgetPickerRef.current && !budgetPickerRef.current.contains(event.target as Node)) {
                setShowBudgetPicker(false);
            }
            if (tipoPropiedadPickerRef.current && !tipoPropiedadPickerRef.current.contains(event.target as Node)) {
                setShowTipoPropiedadPicker(false);
            }
            if (operacionPickerRef.current && !operacionPickerRef.current.contains(event.target as Node)) {
                setShowOperacionPicker(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Cerrar el panel de filtros móvil al hacer clic fuera (solo en móvil y cuando está abierto)
    useEffect(() => {
        if (!mobileFiltersOpen) return;
        const handleClickOutsideMobile = (event: MouseEvent) => {
            const target = event.target as Node;
            // Si el clic es dentro del contenedor de filtros o dentro de la barra de búsqueda, no cerrar
            if (
                (filtroContainerRef.current && filtroContainerRef.current.contains(target)) ||
                (mobileBarRef.current && mobileBarRef.current.contains(target))
            ) {
                return;
            }
            // Si un dropdown interno está abierto, el clic fuera solo debería cerrar el dropdown (manejado por el otro hook)
            if (showLocationPicker || showBudgetPicker || showTipoPropiedadPicker || showOperacionPicker) {
                return;
            }
            // Cerrar el panel solo si no había menús abiertos
            setMobileFiltersOpen(false);
        };
        // Pequeño retraso para evitar que el clic que abrió el panel lo cierre inmediatamente
        const timer = setTimeout(() => {
            document.addEventListener('mousedown', handleClickOutsideMobile);
        }, 100);
        return () => {
            clearTimeout(timer);
            document.removeEventListener('mousedown', handleClickOutsideMobile);
        };
    }, [mobileFiltersOpen, showLocationPicker, showBudgetPicker, showTipoPropiedadPicker, showOperacionPicker]);

    // Resto de efectos y handlers (idénticos al original)
    useEffect(() => {
        fetchDepartamentos();
    }, [fetchDepartamentos]);

    // Si se llega con ubicación en la URL (enlace compartido o volver atrás), hay
    // que cargar las ciudades del departamento para mostrar "Tarija, Yacuiba".
    const initialDeptoRef = useRef(initialFilters.departamento || '');
    useEffect(() => {
        if (initialDeptoRef.current) getCiudadesByDepto(initialDeptoRef.current);
    }, [getCiudadesByDepto]);

    // Mantiene la píldora sincronizada cuando la búsqueda cambia desde fuera
    // (URL, atrás/adelante o la barra flotante). Antes el hero se remontaba con
    // una `key`, lo que cerraba los paneles y provocaba saltos de altura.
    const filtersKey = JSON.stringify(initialFilters ?? {});
    useEffect(() => {
        const next = initialFilters ?? {};
        setTipoPropiedad(next.tipo_propiedad || '');
        setOperacion(next.operacion === 'Alquiler' ? 'Alquiler' : 'Venta');
        setPrecioMin(next.precio_min || '');
        setPrecioMax(next.precio_max || '');
        if ((next.departamento || '') !== selectedDepto) {
            setSelectedDepto(next.departamento || '');
            setSelectedCiudad(next.ciudad || '');
            if (next.departamento) getCiudadesByDepto(next.departamento);
        } else if ((next.ciudad || '') !== selectedCiudad) {
            setSelectedCiudad(next.ciudad || '');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filtersKey]);

    const tipoPropiedadOptions = [
        { value: '', label: '¿Qué buscas?' },
        { value: 'Casa', label: 'Casa', icon: FaHome },
        { value: 'Lote', label: 'Lote / Terreno', icon: FaLandmark },
        { value: 'Departamento', label: 'Departamento', icon: FaBuilding },
    ];
    const getTipoPropiedadLabel = () => {
        const option = tipoPropiedadOptions.find(opt => opt.value === tipoPropiedad);
        return option ? option.label : '¿Qué buscas?';
    };

    const handleOpenLocationPicker = () => {
        // Si ya estaba abierto, el mismo clic lo cierra (como el resto de píldoras).
        if (showLocationPicker) {
            setShowLocationPicker(false);
            return;
        }
        setShowTipoPropiedadPicker(false);
        setShowBudgetPicker(false);
        setShowOperacionPicker(false);
        setLocationStep('deptos');
        setShowLocationPicker(true);
    };
    const handleSelectDepto = async (depto: any) => {
        setSelectedDepto(depto.id); // Guardamos oficialmente el departamento enseguida
        setSelectedCiudad(''); // Reseteamos la ciudad al cambiar de departamento
        // Mostrar inmediatamente el paso de ciudades (UX perceptual)
        setLocationStep('ciudades');
        // Limpiar y cargar ciudades desde el hook (usa select reducido en columnas)
        await getCiudadesByDepto(depto.id);
    };
    const handleSelectCiudad = (ciudad: any) => {
        setSelectedCiudad(ciudad.id);
        setShowLocationPicker(false);
        setLocationStep('deptos');
    };
    const getLocationDisplayText = () => {
        const depto = departamentos.find(d => d.id === selectedDepto);
        const ciudad = ciudades.find(c => c.id === selectedCiudad);
        if (depto && ciudad) return `${depto.nombre}, ${ciudad.nombre}`;
        if (depto) return depto.nombre;
        if (ciudad) return ciudad.nombre;
        return 'Ubicación';
    };

    const esAlquiler = operacion === 'Alquiler';

    const quickRanges = esAlquiler
        ? [
            { label: 'Hasta Bs 1.000', min: 0, max: 1000, desc: 'Cuartos o ambientes pequeños' },
            { label: 'Bs 1.000 - 2.000', min: 1000, max: 2000, desc: 'Alquileres económicos' },
            { label: 'Bs 2.000 - 3.000', min: 2000, max: 3000, desc: 'Departamentos y casas medianas' },
            { label: 'Bs 3.000 - 5.000', min: 3000, max: 5000, desc: 'Casas familiares amplias' },
            { label: 'Más de Bs 5.000', min: 5000, max: null, desc: 'Alquileres de lujo' },
        ]
        : [
            { label: 'Hasta $10,000', min: 0, max: 10000, desc: 'Lotes pequeños o preventas' },
            { label: '$10,000 - $30,000', min: 10000, max: 30000, desc: 'Zonas de expansión' },
            { label: '$30,000 - $70,000', min: 30000, max: 70000, desc: 'Departamentos y casas medianas' },
            { label: '$70,000 - $100,000', min: 70000, max: 100000, desc: 'Casas familiares amplias' },
            { label: 'Más de $100,000', min: 100000, max: null, desc: 'Inversión o lujo' },
        ];
    const monedaSimbolo = esAlquiler ? 'Bs ' : '$';

    /** Cambiar de operación cambia la moneda: el precio anterior deja de valer. */
    const changeOperacion = (nueva: 'Venta' | 'Alquiler') => {
        // Cierra siempre el desplegable, aunque se elija la operación que ya estaba.
        setShowOperacionPicker(false);
        if (nueva === operacion) return;
        setOperacion(nueva);
        setPrecioMin('');
        setPrecioMax('');
        setShowBudgetPicker(false);
    };

    const applyQuickRange = (range: any) => {
        setPrecioMin(range.min.toString());
        setPrecioMax(range.max ? range.max.toString() : '');
        setShowBudgetPicker(false);
    };
    const clearBudget = () => {
        setPrecioMin('');
        setPrecioMax('');
        setShowBudgetPicker(false);
    };
    const hasBudgetFilter = precioMin !== '' || precioMax !== '';

    const buildFilters = () => ({
        tipo_propiedad: tipoPropiedad,
        operacion,
        departamento: selectedDepto,
        ciudad: selectedCiudad,
        precio_min: precioMin,
        precio_max: precioMax,
    });

    const clearAllFilters = () => {
        setTipoPropiedad('');
        setOperacion('Venta');
        setSelectedDepto('');
        setSelectedCiudad('');
        setPrecioMin('');
        setPrecioMax('');
        setShowLocationPicker(false);
        setShowBudgetPicker(false);
        setShowTipoPropiedadPicker(false);
        setMobileFiltersOpen(false);
        setSmartSearch(false);
        setQuery('');
        onSearch({}, '');
    };

    // Los dos modos son excluyentes: o escribes, o filtras. Nunca ambos en la misma petición.
    const activateSmartSearch = () => {
        setSmartSearch(true);
        setMobileFiltersOpen(false);
        setShowLocationPicker(false);
        setShowBudgetPicker(false);
        setShowTipoPropiedadPicker(false);
        setTimeout(() => smartInputRef.current?.focus(), 180);
    };

    const switchToFilters = (refocusChip = false) => {
        setSmartSearch(false);
        setShowLocationPicker(false);
        setShowBudgetPicker(false);
        setShowTipoPropiedadPicker(false);
        if (typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches) {
            setMobileFiltersOpen(true);
        }
        // El texto se conserva por si el visitante vuelve al modo inteligente,
        // pero aquí solo viajan los filtros. No se baja a los resultados: el
        // cambio de modo no debe mover la vista.
        onSearch(buildFilters(), '', { scrollToResults: false });
        if (refocusChip) {
            setTimeout(() => smartChipRef.current?.focus({ preventScroll: true }), 0);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setMobileFiltersOpen(false);

        if (!smartSearch) {
            onSearch(buildFilters(), '');
            return;
        }

        const texto = query.trim();
        if (texto.length < 3) {
            smartInputRef.current?.focus();
            return;
        }

        // Modo texto: los filtros no se envían, así no pueden contradecir lo escrito.
        onSearch({}, texto);
    };

    const toggleMobileFilters = () => {
        // El mismo botón abre y cierra: pulsarlo de nuevo oculta el panel.
        if (mobileFiltersOpen) {
            setMobileFiltersOpen(false);
            setShowLocationPicker(false);
            setShowBudgetPicker(false);
            setShowTipoPropiedadPicker(false);
            setShowOperacionPicker(false);
            return;
        }
        setMobileFiltersOpen(true);
        // Scroll suave al formulario después de que se muestre, sin saltar al top
        setTimeout(() => {
            filtroContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 150);
    };

    return (
        <div
            className="w-full relative overflow-visible pt-6 md:pt-3 lg:pt-16 pb-6 md:pb-1 lg:pb-12 px-4 md:px-12 lg:px-24 font-sans"
            style={{ backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }}
        >
            {/* Contenedor Principal Hero */}
            <div className="max-w-[1400px] mx-auto flex flex-col lg:flex-row items-stretch justify-between gap-8 lg:gap-4 relative z-10">
                {/* LADO IZQUIERDO: Tipografía */}
                <div className="w-full lg:w-[48%] flex flex-col justify-center text-left z-10 pb-4 lg:pb-0 select-none px-2.5 lg:px-0">
                    <h1 className="text-[34px] md:text-[52px] lg:text-[102px] font-serif font-black italic text-gray-900 leading-[1.08] md:leading-[1.03] tracking-tighter mb-3 md:mb-2 lg:mb-5">
                        Tu casa{' '}<br className="hidden lg:inline" />
                        <span className="italic font-normal text-accent">ideal</span><br />
                        en Tarija{' '}<br className="hidden lg:inline" />
                        y Bolivia.
                    </h1>
                    <p className="text-muted text-base md:text-lg lg:text-[18.5px] max-w-sm leading-relaxed font-medium pl-1 mt-3.5 md:mt-0.5 lg:mt-0">
                        Encuentra el hogar donde tu familia crecerá con tranquilidad
                    </p>
                </div>

                {/* LADO DERECHO: Tarjeta de fondo + Casa 3D */}
                <div className="w-full lg:w-[52%] flex items-center justify-center lg:justify-end relative min-h-[330px] md:min-h-[380px] lg:min-h-[480px]">
                    <div
                        className="absolute w-[88%] h-[80%] top-[4%] right-[6%] rounded-[40px] -rotate-[4deg] border border-white/35 shadow-[0_10px_26px_-20px_rgba(60,8,17,0.12)] pointer-events-none z-0 md:w-[80%] md:h-[330px] md:top-[3%] md:right-[10%] md:rounded-[36px] md:-rotate-[3deg] md:border-white/35 md:shadow-[0_10px_26px_-20px_rgba(60,8,17,0.12)] lg:w-[75%] lg:h-[80%] lg:top-[8%] lg:right-[5%] lg:rounded-[48px] lg:rotate-0 lg:border-white/50 lg:shadow-2xl"
                        style={{
                            backgroundImage: `url(${fondotarjetaUrl})`,
                            backgroundSize: 'cover',
                            backgroundPosition: '30% 70%',
                            backgroundRepeat: 'no-repeat',
                        }}
                    >
                        {/* En móvil/tablet el recorte de la textura queda muy plano: se refuerza con un degradado */}
                        <div className="absolute inset-0 rounded-[40px] bg-gradient-to-br from-[#FDF7EE] via-[#F6E8DD] to-[#F1DDD3] lg:hidden" />
                    </div>
                    <div className="relative z-10 w-full max-w-[500px] transform translate-x-[2%] translate-y-[9%] md:w-[475px] md:max-w-[475px] md:translate-x-[9%] md:translate-y-[12%] lg:w-full lg:max-w-[550px] lg:translate-x-[10%] lg:translate-y-[12%] transition-transform duration-500 hover:scale-[1.02]">
                        <img src={portadaUrl1} alt="Casas exclusivas en Bolivia" className="w-full h-auto object-contain filter drop-shadow-ideal-isometric" />
                    </div>
                    {/* Sombra de apoyo: la casa "apoya" sobre la tarjeta */}
                    <div className="absolute bottom-[3%] left-1/2 -translate-x-1/2 w-[60%] h-[30px] bg-black/15 blur-[18px] rounded-full z-[5] pointer-events-none lg:hidden" />
                </div>
            </div>

            {/* ========== ACTIVADOR DE BÚSQUEDA INTELIGENTE ========== */}
            {smartSearchEnabled && (
                <div className="max-w-[820px] mx-auto mt-6 md:mt-2.5 relative z-20">
                    <div className="flex items-center justify-between gap-3 px-1 mb-2 md:mb-3">
                        <button
                            type="button"
                            ref={smartChipRef}
                            onClick={() => (smartSearch ? switchToFilters(true) : activateSmartSearch())}
                            aria-pressed={smartSearch}
                            title={smartSearch ? 'Volver a la búsqueda por filtros' : 'Buscar describiendo lo que necesitas'}
                            className={`inline-flex items-center gap-2 rounded-full border px-4 min-h-[40px] text-[11.5px] md:text-[12px] font-bold uppercase tracking-[0.12em] transition-all duration-200 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${smartSearch
                                ? 'bg-primary text-crema border-primary shadow-md'
                                : 'bg-white/70 backdrop-blur-md text-ink-soft border-white/70 shadow-sm hover:text-primary-dark hover:border-accent/60'
                            }`}
                        >
                            <FaMagic size={11} className={smartSearch ? 'text-accent' : 'text-accent/80'} aria-hidden />
                            Búsqueda inteligente
                            {smartSearch && <FaTimes size={10} className="opacity-80" aria-hidden />}
                        </button>
                        {smartSearch && (
                            <span className="hidden sm:block text-[11px] text-muted font-medium truncate">
                                Describe zona, características y presupuesto
                            </span>
                        )}
                    </div>
                </div>
            )}

            {/* Barra de búsqueda simplificada (solo móvil) */}
            <div ref={mobileBarRef} id="barra-busqueda-movil" className={`lg:hidden mt-6 ${smartSearch ? 'hidden' : ''}`}>
                <div className="flex items-center gap-3 bg-white/80 backdrop-blur-sm rounded-full p-1.5 shadow-md border border-white/50">
                    <button onClick={toggleMobileFilters} aria-expanded={mobileFiltersOpen} className="flex-1 flex items-center gap-2 pl-4 min-h-[44px] py-3 text-muted focus:outline-none">
                        <FaSearch className="text-accent" size={16} />
                        <span className="text-sm font-medium">Buscar propiedades...</span>
                    </button>
                    <button
                        onClick={toggleMobileFilters}
                        aria-expanded={mobileFiltersOpen}
                        aria-label={mobileFiltersOpen ? 'Cerrar filtros de búsqueda' : 'Abrir filtros de búsqueda'}
                        className="bg-primary-dark hover:bg-black text-white p-3 rounded-full transition-colors"
                    >
                        <FaSlidersH size={16} />
                    </button>
                </div>
            </div>

            {/* Panel de filtros con transición suave (visible siempre en desktop) */}
            <div
                ref={filtroContainerRef}
                className={`
                    transition-all duration-300 ease-in-out
                    ${mobileFiltersOpen || anyDropdownOpen || smartSearch ? 'max-h-[1000px] opacity-100 mt-1 overflow-visible' : 'max-h-0 opacity-0 mt-0 overflow-hidden'}
                    lg:max-h-none lg:opacity-100 lg:mt-0 lg:overflow-visible
                `}
            >
                <div id="filtro-busqueda" className="max-w-[820px] mx-auto relative z-30">
                    <form onSubmit={handleSubmit} className="bg-white/85 backdrop-blur-xl p-2.5 md:p-3.5 rounded-[38px] md:rounded-[50px] shadow-ideal-pill border border-white/70">
                        {/* Búsqueda inteligente: ocupa la píldora completa y esconde los filtros */}
                        {smartSearch && (
                            <div className="flex items-center gap-1.5 px-1 md:px-2">
                                <div className="flex-1 flex items-center gap-3 min-w-0">
                                    <FaSearch className="text-accent shrink-0" size={14} aria-hidden />
                                    <input
                                        ref={smartInputRef}
                                        type="text"
                                        value={query}
                                        onChange={(e) => setQuery(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key !== 'Escape') return;
                                            e.stopPropagation();
                                            if (query) setQuery('');
                                            else switchToFilters(true);
                                        }}
                                        aria-label="Describe el inmueble que buscas"
                                        name="smart_query"
                                        autoComplete="off"
                                        placeholder={compactPlaceholder ? 'Casa con jardín…' : 'Ej.: casa con jardín en San Blas, hasta $80.000'}
                                        className="w-full min-w-0 bg-transparent py-2.5 text-[14px] md:text-[15px] font-medium text-ink-soft placeholder-gray-400 focus:outline-none"
                                    />
                                    {query && (
                                        <button type="button" onClick={() => setQuery('')} aria-label="Borrar texto" className="p-2 text-gray-400 hover:text-primary-dark transition-colors">
                                            <FaTimes size={11} />
                                        </button>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => switchToFilters(true)}
                                    aria-label="Cambiar a búsqueda con filtros"
                                    title="Cambiar a búsqueda con filtros"
                                    className="bg-crema/90 hover:bg-crema-dark text-ink-soft p-3 rounded-full transition-colors shrink-0"
                                >
                                    <FaSlidersH size={15} />
                                </button>
                                <button type="submit" className="bg-primary-dark hover:bg-black text-white font-bold text-[11px] uppercase tracking-widest py-3 px-4 md:px-5 rounded-full transition-all duration-200 flex items-center justify-center gap-2 active:scale-95 shrink-0">
                                    Buscar <FaArrowRight size={10} className="opacity-90" />
                                </button>
                            </div>
                        )}
                        {!smartSearch && (
                        <div className="grid grid-cols-1 md:grid-cols-2 min-[900px]:flex min-[900px]:flex-row items-center gap-1.5 w-full">
                            {/* 1. Tipo de inmueble */}
                            <div className="w-full min-[900px]:flex-1 min-[900px]:w-auto min-[900px]:min-w-0 relative" ref={tipoPropiedadPickerRef}>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowLocationPicker(false);
                                        setShowBudgetPicker(false);
                                        setShowOperacionPicker(false);
                                        setShowTipoPropiedadPicker(prev => !prev);
                                    }}
                                    aria-haspopup="listbox"
                                    aria-expanded={showTipoPropiedadPicker}
                                    className="w-full bg-crema/90 hover:bg-crema-dark text-ink-soft font-bold text-[13.5px] md:text-[14px] min-[900px]:text-[13px] rounded-full py-3.5 px-5 min-[900px]:px-3 flex items-center justify-between transition-colors"
                                >
                                    <div className="flex items-center gap-2.5 min-[900px]:gap-2 truncate">
                                        {tipoPropiedad === 'Casa' ? <FaHome className="text-accent" size={14} /> :
                                            tipoPropiedad === 'Lote' ? <FaLandmark className="text-accent" size={13} /> :
                                                tipoPropiedad === 'Departamento' ? <FaBuilding className="text-accent" size={13} /> :
                                                    <FaMapMarkerAlt className="text-accent" size={13} />}
                                        <span className="truncate">{getTipoPropiedadLabel()}</span>
                                    </div>
                                    <FaChevronDown size={10} className="text-accent/80 ml-1" />
                                </button>
                                {showTipoPropiedadPicker && (
                                    <div className="absolute left-0 z-50 mt-2 w-full bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden animate-fadeIn">
                                        {tipoPropiedadOptions.map(opt => {
                                            const Icon = opt.icon;
                                            return (
                                                <div
                                                    key={opt.value || 'default'}
                                                    onClick={() => {
                                                        setTipoPropiedad(opt.value);
                                                        setShowTipoPropiedadPicker(false);
                                                    }}
                                                    className={`p-3 hover:bg-crema cursor-pointer flex items-center gap-3 text-[13px] text-gray-700 font-semibold transition-colors ${tipoPropiedad === opt.value ? 'bg-crema text-primary-dark font-bold' : ''}`}
                                                >
                                                    {Icon && <Icon size={13} className="text-accent" />}
                                                    <span>{opt.label}</span>
                                                    {tipoPropiedad === opt.value && <FaCheck size={10} className="ml-auto text-primary-dark" />}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* 2. Ubicación */}
                            <div className="w-full min-[900px]:flex-1 min-[900px]:w-auto min-[900px]:min-w-0 relative" ref={locationPickerRef}>
                                <button
                                    type="button"
                                    onClick={handleOpenLocationPicker}
                                    aria-haspopup="dialog"
                                    aria-expanded={showLocationPicker}
                                    className="w-full bg-crema/90 hover:bg-crema-dark text-ink-soft font-bold text-[13.5px] md:text-[14px] min-[900px]:text-[13px] rounded-full py-3.5 px-5 min-[900px]:px-3.5 flex items-center justify-between transition-colors"
                                >
                                    <div className="flex items-center gap-2.5 truncate">
                                        <FaMap className="text-accent" size={13} />
                                        <span className="truncate">{getLocationDisplayText()}</span>
                                    </div>
                                    <FaChevronDown size={10} className="text-accent/70 ml-1" />
                                </button>
                                {showLocationPicker && (
                                    <div className="absolute left-0 z-50 mt-2 w-full sm:w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden animate-fadeIn">
                                        <div className="p-2.5 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                                            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">{locationStep === 'deptos' ? 'Departamento' : 'Ciudades'}</span>
                                            {locationStep === 'ciudades' && (
                                                <button type="button" onClick={() => setLocationStep('deptos')} className="text-[11px] text-accent font-bold hover:underline">Volver</button>
                                            )}
                                        </div>
                                        <div className="max-h-64 overflow-y-auto p-1">
                                            {locationStep === 'deptos' && departamentos.map(depto => (
                                                <div key={depto.id} onClick={() => handleSelectDepto(depto)} className="p-2.5 hover:bg-crema rounded-lg cursor-pointer flex items-center justify-between text-[13px] text-gray-700">
                                                    <span className="font-medium">{depto.nombre}</span>
                                                    <FaChevronRight size={10} className="text-gray-300" />
                                                </div>
                                            ))}
                                            {locationStep === 'ciudades' && (
                                                isLoadingCiudades ? (
                                                    <div className="p-4 text-center text-xs text-gray-400 flex items-center justify-center gap-2">
                                                        <FaSpinner className="animate-spin text-accent" size={12} /> Cargando...
                                                    </div>
                                                ) : (
                                                    ciudades.map(ciudad => (
                                                        <div key={ciudad.id} onClick={() => handleSelectCiudad(ciudad)} className="p-2.5 hover:bg-crema rounded-lg cursor-pointer text-[13px] text-gray-700 font-medium">
                                                            {ciudad.nombre}
                                                        </div>
                                                    ))
                                                )
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* 3. Operación: dos píldoras en móvil, un desplegable en escritorio */}
                            <div className="w-full min-[900px]:hidden">
                                <div role="group" aria-label="Operación" className="w-full bg-crema/90 rounded-full p-1 flex items-center gap-1">
                                    {(['Venta', 'Alquiler'] as const).map((op) => (
                                        <button
                                            key={op}
                                            type="button"
                                            onClick={() => changeOperacion(op)}
                                            aria-pressed={operacion === op}
                                            className={`flex-1 min-h-[38px] px-3 rounded-full text-[12.5px] md:text-[13px] font-bold transition-colors ${operacion === op
                                                ? 'bg-primary-dark text-white shadow'
                                                : 'text-ink-soft hover:bg-crema-dark'
                                                }`}
                                        >
                                            {op}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="hidden min-[900px]:block min-[900px]:flex-none min-[900px]:w-[124px] relative" ref={operacionPickerRef}>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowTipoPropiedadPicker(false);
                                        setShowLocationPicker(false);
                                        setShowBudgetPicker(false);
                                        setShowOperacionPicker(prev => !prev);
                                    }}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    aria-haspopup="listbox"
                                    aria-expanded={showOperacionPicker}
                                    aria-label={`Operación: ${operacion}. Cambiar`}
                                    className="w-full bg-crema/90 hover:bg-crema-dark text-ink-soft font-bold text-[13px] rounded-full py-3.5 px-3.5 flex items-center justify-between transition-colors"
                                >
                                    <div className="flex items-center gap-2 truncate">
                                        {esAlquiler
                                            ? <FaKey className="text-accent" size={12} />
                                            : <FaTag className="text-accent" size={12} />}
                                        <span className="truncate">{operacion}</span>
                                    </div>
                                    <FaChevronDown size={10} className="text-accent/80 ml-1" />
                                </button>
                                {showOperacionPicker && (
                                    <div role="listbox" aria-label="Operación" className="absolute left-0 z-50 mt-2 w-full min-w-[136px] bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden animate-fadeIn">
                                        {(['Venta', 'Alquiler'] as const).map((op) => {
                                            const Icon = op === 'Alquiler' ? FaKey : FaTag;
                                            return (
                                                <div
                                                    key={op}
                                                    role="option"
                                                    aria-selected={operacion === op}
                                                    onClick={() => {
                                                        changeOperacion(op);
                                                        setShowOperacionPicker(false);
                                                    }}
                                                    className={`p-3 hover:bg-crema cursor-pointer flex items-center gap-3 text-[13px] text-gray-700 font-semibold transition-colors ${operacion === op ? 'bg-crema text-primary-dark font-bold' : ''}`}
                                                >
                                                    <Icon size={12} className="text-accent" />
                                                    <span>{op}</span>
                                                    {operacion === op && <FaCheck size={10} className="ml-auto text-primary-dark" />}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* 5. Presupuesto */}
                            <div className="w-full min-[900px]:flex-1 min-[900px]:w-auto min-[900px]:min-w-0 relative" ref={budgetPickerRef}>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowLocationPicker(false);
                                        setShowTipoPropiedadPicker(false);
                                        setShowOperacionPicker(false);
                                        setShowBudgetPicker(prev => !prev);
                                    }}
                                    aria-haspopup="dialog"
                                    aria-expanded={showBudgetPicker}
                                    className="w-full bg-crema/90 hover:bg-crema-dark text-ink-soft font-bold text-[13.5px] md:text-[14px] min-[900px]:text-[13px] rounded-full py-3.5 px-5 min-[900px]:px-3.5 flex items-center justify-between transition-all"
                                >
                                    <div className="flex items-center gap-2.5 truncate">
                                        <FaDollarSign className="text-accent" size={13} />
                                        <span className="truncate">{hasBudgetFilter ? `${precioMin ? `${monedaSimbolo}${parseInt(precioMin).toLocaleString()}` : '0'}-${precioMax ? `${monedaSimbolo}${parseInt(precioMax).toLocaleString()}` : '∞'}` : 'Presupuesto'}</span>
                                    </div>
                                    <div className="flex items-center gap-1 ml-auto">
                                        {hasBudgetFilter && <span role="button" tabIndex={0} aria-label="Limpiar presupuesto" onClick={(e) => { e.stopPropagation(); clearBudget(); }} className="text-gray-400 hover:text-primary-dark mr-1 cursor-pointer"><FaTimes size={10} /></span>}
                                        <FaChevronDown size={10} className="text-accent/70" />
                                    </div>
                                </button>
                                {showBudgetPicker && (
                                    <div className="absolute right-0 z-50 mt-2 w-full sm:w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden animate-fadeIn">
                                        <div className="p-3 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                                            <h4 className="font-bold text-gray-700 text-xs">Rangos rápidos</h4>
                                            <button type="button" onClick={clearBudget} className="text-[11px] text-accent font-bold hover:underline">Borrar</button>
                                        </div>
                                        <div className="p-1 max-h-48 overflow-y-auto">
                                            {quickRanges.map((range, idx) => (
                                                <button key={idx} type="button" onClick={() => applyQuickRange(range)} className="w-full text-left p-2.5 text-[12px] rounded-lg hover:bg-crema text-gray-700 flex justify-between items-center">
                                                    <div><p className="font-semibold">{range.label}</p><p className="text-[10px] text-gray-400">{range.desc}</p></div>
                                                </button>
                                            ))}
                                        </div>
                                        <div className="border-t border-gray-100 p-3 bg-gray-50/50">
                                            <div className="flex gap-2">
                                                <input type="number" aria-label="Precio mínimo" placeholder="Min" value={precioMin} onChange={e => setPrecioMin(e.target.value)} className="w-1/2 px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs focus:outline-none" />
                                                <input type="number" aria-label="Precio máximo" placeholder="Max" value={precioMax} onChange={e => setPrecioMax(e.target.value)} className="w-1/2 px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs focus:outline-none" />
                                            </div>
                                            <button type="button" onClick={() => setShowBudgetPicker(false)} className="mt-2.5 w-full bg-primary-dark text-white py-2 rounded-lg text-xs font-bold transition-colors hover:bg-black">Aplicar</button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* 4. Botón Buscar */}
                            <div className="w-full md:col-span-2 min-[900px]:col-span-1 min-[900px]:w-[15%] min-[900px]:flex-none">
                                <button type="submit" className="w-full bg-primary-dark hover:bg-black text-white font-bold text-[12px] uppercase tracking-widest py-3.5 px-4 rounded-full transition-all duration-200 flex items-center justify-center gap-2 active:scale-95">
                                    Buscar <FaArrowRight size={10} className="opacity-90" />
                                </button>
                            </div>
                        </div>
                        )}
                    </form>
                    <div className="flex justify-end mt-3 px-2">
                        <button type="button" onClick={clearAllFilters} className="text-muted text-xs font-medium hover:text-primary-dark transition-colors flex items-center gap-1.5 group min-h-[44px] py-2 px-2 rounded-lg">
                            <FaTrashAlt className="text-[10px] group-hover:scale-105" /> Limpiar búsqueda
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};