import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useInmuebles } from '../hooks/useData';
import { PropertyCard } from '../components/PropertyCard';
import { SearchHero } from '../components/SearchHero';
import { FloatingSearchBar } from '../components/FloatingSearchBar';
import { SkeletonsGrid } from '../components/Skeletons';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { useSEO } from '../hooks/useSEO';
import { useBusinessConfig } from '../hooks/useBusinessConfig';
import { useSemanticSearch, type SemanticBudget } from '../hooks/useSemanticSearch';

/** Se puede apagar con VITE_FEATURE_SEMANTIC_SEARCH=false para volver al listado anterior. */
const SEMANTIC_ENABLED = import.meta.env.VITE_FEATURE_SEMANTIC_SEARCH !== 'false';

/** Por debajo de este valor la búsqueda no encontró coincidencias claras (hallazgo de F5). */
const LOW_RELEVANCE = 0.45;

/** Se revelan 6 tarjetas por clic sobre un máximo de 24 resultados por búsqueda. */
const SEMANTIC_BATCH = 6;
const SEMANTIC_LIMIT = 24;

type CardInmueble = React.ComponentProps<typeof PropertyCard>['inmueble'];

const formatMoney = (value: number) => new Intl.NumberFormat('es-BO', { maximumFractionDigits: 0 }).format(value);

/** “Hasta USD 50.000”, “Desde USD 40.000” o “USD 40.000 – 60.000”. */
const formatBudgetLabel = (budget: SemanticBudget) => {
    if (!budget) return null;
    const cur = budget.moneda === 'Bs' ? 'Bs' : 'USD';
    if (budget.min !== null && budget.max !== null) return `${cur} ${formatMoney(budget.min)} \u2013 ${formatMoney(budget.max)}`;
    if (budget.max !== null) return `hasta ${cur} ${formatMoney(budget.max)}`;
    if (budget.min !== null) return `desde ${cur} ${formatMoney(budget.min)}`;
    return null;
};

/** `?operacion=alquiler` → `Alquiler`; cualquier otra cosa cae en `Venta`. */
const normalizeOperacion = (value?: string | null): 'Venta' | 'Alquiler' =>
    (value ?? '').toLowerCase() === 'alquiler' ? 'Alquiler' : 'Venta';

const filtersFromParams = (params: URLSearchParams): Record<string, string> => {
    const result: Record<string, string> = {};
    params.forEach((value, key) => {
        // `q` es la consulta semántica, no un filtro del listado.
        if (key === 'q') return;
        if (!value) return;
        result[key] = key === 'operacion' ? normalizeOperacion(value) : value;
    });
    return result;
};

export const LandingPage: React.FC = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const { config } = useBusinessConfig();

    useSEO({
        title: normalizeOperacion(searchParams.get('operacion')) === 'Alquiler'
            ? 'Alquileres en Tarija y Bolivia | ChuroHogar'
            : config.seoTitulo,
        description: normalizeOperacion(searchParams.get('operacion')) === 'Alquiler'
            ? 'Casas, departamentos y lotes en alquiler en Tarija y Bolivia. Precios mensuales en bolivianos y contacto directo por WhatsApp.'
            : config.seoDescripcion,
        canonicalPath: '/',
    });

    const [page, setPage] = useState(() => {
        const savedPage = sessionStorage.getItem('lp_page');
        return savedPage ? parseInt(savedPage) : 0;
    });

    const [filters, setFilters] = useState<Record<string, string>>(() => {
        const fromUrl = filtersFromParams(searchParams);
        if (Object.keys(fromUrl).length > 0) return fromUrl;
        const savedFilters = sessionStorage.getItem('lp_filters');
        return savedFilters ? JSON.parse(savedFilters) : {};
    });

    const [query, setQuery] = useState(() => (searchParams.get('q') ?? '').trim());
    const operacion = normalizeOperacion(filters.operacion);
    const esAlquiler = operacion === 'Alquiler';
    // Modo de la píldora: texto (inteligente) o filtros. Lo comparten hero y flotante.
    const [smartMode, setSmartMode] = useState(() => (searchParams.get('q') ?? '').trim() !== '');
    // Se incrementan para que el hero abra los filtros o enfoque el campo desde el flotante.
    const [openFiltersToken, setOpenFiltersToken] = useState(0);
    const [focusSmartToken, setFocusSmartToken] = useState(0);
    // Resultados semánticos visibles: se revelan de 6 en 6 sobre los 24 ya cargados.
    const [visibleSemantic, setVisibleSemantic] = useState(SEMANTIC_BATCH);
    // Presupuesto leído del texto: se puede ignorar desde el estado vacío.
    const [ignoreBudget, setIgnoreBudget] = useState(false);
    const [ignoredBudget, setIgnoredBudget] = useState<SemanticBudget>(null);

    React.useEffect(() => {
        sessionStorage.setItem('lp_page', page.toString());
        sessionStorage.setItem('lp_filters', JSON.stringify(filters));
    }, [page, filters]);

    // Mantener los filtros sincronizados con la URL (permite compartir enlaces y usar atrás/adelante)
    React.useEffect(() => {
        const fromUrl = filtersFromParams(searchParams);
        setFilters((prev) => (JSON.stringify(prev) === JSON.stringify(fromUrl) ? prev : fromUrl));
        setQuery((searchParams.get('q') ?? '').trim());
    }, [searchParams]);

    const { inmuebles, loading, totalPages } = useInmuebles(page, filters);

    const {
        search: searchSemantic,
        reset: resetSemantic,
        data: semanticData,
        loading: semanticLoading,
        error: semanticError,
    } = useSemanticSearch();

    const semanticActive = SEMANTIC_ENABLED && query.trim().length >= 3;
    const showingSemantic = semanticActive && !semanticError;

    // Se ejecuta al enviar (la URL cambia), no en cada tecla.
    const lastQueryRef = React.useRef(query);
    React.useEffect(() => {
        setVisibleSemantic(SEMANTIC_BATCH);

        // Una búsqueda nueva vuelve a respetar el presupuesto escrito en el texto,
        // sin lanzar una petición con el estado anterior.
        let budgetIgnored = ignoreBudget;
        if (lastQueryRef.current !== query) {
            lastQueryRef.current = query;
            budgetIgnored = false;
            if (ignoreBudget) {
                setIgnoreBudget(false);
                setIgnoredBudget(null);
            }
        }

        if (!semanticActive) {
            resetSemantic();
            return;
        }

        // Modo texto: sin filtros. Los dos modos son excluyentes para no contradecirse.
        // Límite fijo para que la caché (consulta + límite) se reutilice sin volver a Gemini.
        // F7-08: la repetición exacta se resuelve desde sessionStorage sin tocar el servidor.
        searchSemantic(query, {}, { limit: SEMANTIC_LIMIT, ignoreBudget: budgetIgnored, useSessionCache: true }).catch(() => {
            // El error se muestra en pantalla y el listado por filtros sigue disponible.
        });
    }, [semanticActive, query, searchSemantic, resetSemantic, ignoreBudget]);

    const isFiltered = React.useMemo(() => {
        if (!filters) return false;
        return Object.values(filters).some(val => val && val.toString().trim() !== '');
    }, [filters]);

    const activeFilterCount = React.useMemo(
        () => Object.values(filters ?? {}).filter(val => String(val ?? '').trim() !== '').length,
        [filters]
    );

    // Si el texto desaparece (atrás/adelante del navegador), la píldora vuelve a filtros.
    React.useEffect(() => {
        if (!query.trim()) setSmartMode(false);
    }, [query]);

    const semanticResults = semanticData?.results ?? [];
    const lowRelevance = semanticResults.length > 0
        && Math.max(...semanticResults.map(result => result.similarity)) < LOW_RELEVANCE;

    const detectedZone = semanticData
        ? semanticData.detected.barrio?.nombre
        ?? semanticData.detected.ciudad?.nombre
        ?? semanticData.detected.departamento?.nombre
        ?? null
        : null;

    const detectedBudget = semanticData?.detected.presupuesto ?? null;
    const budgetLabel = formatBudgetLabel(detectedBudget);
    const ignoredBudgetLabel = formatBudgetLabel(ignoredBudget);

    /** El visitante prefiere ver los resultados aunque superen el presupuesto que escribió. */
    const dropBudget = () => {
        setIgnoredBudget(detectedBudget);
        setIgnoreBudget(true);
    };
    const restoreBudget = () => {
        setIgnoreBudget(false);
        setIgnoredBudget(null);
    };

    const handleSearch = (newFilters: Record<string, string>, searchQuery?: string) => {        const texto = (searchQuery ?? '').trim();
        // Modos excluyentes: si hay texto, los filtros no se aplican ni viajan en la URL.
        const cleanFilters = texto
            ? {}
            : Object.fromEntries(
                Object.entries(newFilters || {}).filter(([, value]) => String(value ?? '').trim() !== '')
            );
        setSmartMode(Boolean(texto));
        setFilters(cleanFilters);
        setPage(0);
        setQuery(texto);
        const params = new URLSearchParams();
        Object.entries(cleanFilters).forEach(([key, value]) => {
            params.set(key, key === 'operacion' ? String(value).toLowerCase() : String(value));
        });
        if (texto) params.set('q', texto);
        setSearchParams(params);
        setTimeout(() => {
            document.getElementById('inmuebles-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
    };

    /** Cambiar de operación cambia la moneda: el precio anterior se descarta. */
    const changeOperacion = (nueva: 'Venta' | 'Alquiler') => {
        const rest = { ...filters };
        delete rest.precio_min;
        delete rest.precio_max;
        handleSearch({ ...rest, operacion: nueva }, '');
    };

    return (
        <div className="min-h-screen flex flex-col overflow-x-hidden">
            <Navbar />

            <main className="flex-grow">
                <SearchHero
                    key={JSON.stringify(filters)}
                    onSearch={handleSearch}
                    initialFilters={filters}
                    initialQuery={SEMANTIC_ENABLED ? query : ''}
                    smartSearchEnabled={SEMANTIC_ENABLED}
                    smartSearch={SEMANTIC_ENABLED && smartMode}
                    onSmartSearchChange={setSmartMode}
                    openFiltersToken={openFiltersToken}
                    focusSmartToken={focusSmartToken}
                />

                <section id="inmuebles-grid" className="max-w-6xl mx-auto px-6 md:px-12 pt-2 pb-20 scroll-mt-[132px] md:scroll-mt-[152px]">

                    {/* Header */}
                    <div className="mb-10 md:mb-16">
                        {showingSemantic ? (
                            <>
                                <h2 className="text-4xl md:text-6xl font-serif font-black text-ink mb-3">
                                    Resultados de tu <span className="italic font-light text-accent">búsqueda</span>
                                </h2>
                                <p className="text-muted text-base md:text-lg max-w-2xl leading-relaxed break-words">
                                    «{query}»
                                </p>
                            </>
                        ) : (
                            <h2 className="text-5xl md:text-6xl font-serif font-black text-ink mb-4">
                                {esAlquiler ? (
                                    <>Alquileres <span className="italic font-light text-accent">Disponibles</span></>
                                ) : (
                                    <>Inmuebles <span className="italic font-light text-accent">Destacados</span></>
                                )}
                            </h2>
                        )}
                    </div>

                    {/* Estado de la búsqueda semántica */}
                    {showingSemantic && !semanticLoading && semanticData && semanticResults.length > 0 && (
                        <div aria-live="polite" className="-mt-6 mb-8 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                            <span className="font-bold text-primary">
                                {semanticData.count}{semanticData.count >= SEMANTIC_LIMIT ? '+' : ''} {semanticData.count === 1 ? 'inmueble' : 'inmuebles'}
                            </span>
                            {detectedZone && (
                                <span className="text-muted">
                                    Zona detectada: <strong className="text-ink-soft">{detectedZone}</strong>
                                </span>
                            )}
                            {budgetLabel && (
                                <span className="inline-flex items-center gap-2 rounded-full bg-crema px-3 py-1 text-ink-soft">
                                    Presupuesto: <strong>{budgetLabel}</strong>
                                    <button
                                        type="button"
                                        onClick={dropBudget}
                                        className="font-semibold text-primary underline-offset-2 hover:underline"
                                    >
                                        quitar
                                    </button>
                                </span>
                            )}
                            {ignoreBudget && ignoredBudgetLabel && (
                                <span className="inline-flex items-center gap-2 rounded-full bg-crema px-3 py-1 text-ink-soft">
                                    Sin límite de precio
                                    <button
                                        type="button"
                                        onClick={restoreBudget}
                                        className="font-semibold text-primary underline-offset-2 hover:underline"
                                    >
                                        aplicar {ignoredBudgetLabel}
                                    </button>
                                </span>
                            )}
                            <span className="text-xs font-semibold uppercase tracking-wider text-muted/80">
                                {semanticData.cached ? 'Desde caché' : 'Calculada ahora'} · {semanticData.timings.total_ms} ms
                            </span>
                        </div>
                    )}

                    {/* Si la búsqueda inteligente falla, se avisa y se usa el listado normal */}
                    {semanticActive && semanticError && (
                        <div role="alert" className="mb-8 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
                            No pudimos completar la búsqueda inteligente, así que te mostramos los inmuebles
                            según tus filtros.
                            <button
                                type="button"
                                onClick={() => handleSearch(filters, '')}
                                className="ml-2 font-bold underline hover:no-underline"
                            >
                                Quitar la búsqueda
                            </button>
                        </div>
                    )}

                    {/* GRID */}
                    {showingSemantic ? (
                        semanticLoading ? (
                            <SkeletonsGrid count={6} />
                        ) : semanticResults.length === 0 ? (
                            <div className="text-center py-16 px-4">
                                <p className="text-xl md:text-2xl font-semibold text-ink mb-2 break-words">
                                    No encontramos inmuebles para «{query}».
                                </p>
                                <p className="text-muted mb-8 max-w-lg mx-auto">
                                    {budgetLabel
                                        ? `No hay inmuebles ${budgetLabel} con esos datos. Prueba a subir el presupuesto o a quitar ese límite.`
                                        : 'Prueba con otras palabras, amplía el presupuesto o revisa los filtros.'}
                                </p>
                                <div className="flex flex-col sm:flex-row justify-center gap-3">
                                    {budgetLabel && (
                                        <button
                                            onClick={dropBudget}
                                            className="bg-primary text-white hover:bg-black font-bold text-sm uppercase tracking-widest py-3.5 px-8 rounded-full transition-all duration-300"
                                        >
                                            Buscar sin límite de precio
                                        </button>
                                    )}
                                    <button
                                        onClick={() => handleSearch({}, '')}
                                        className={`${budgetLabel ? 'border-2 border-ink text-ink hover:bg-ink hover:text-white' : 'bg-primary text-white hover:bg-black'} font-bold text-sm uppercase tracking-widest py-3.5 px-8 rounded-full transition-all duration-300`}
                                    >
                                        Ver todos los inmuebles
                                    </button>
                                    <button
                                        onClick={() => handleSearch(filters, '')}
                                        className="border-2 border-ink text-ink hover:bg-ink hover:text-white font-bold text-sm uppercase tracking-widest py-3.5 px-8 rounded-full transition-all duration-300"
                                    >
                                        Limpiar la búsqueda
                                    </button>
                                </div>
                                {ignoreBudget && ignoredBudgetLabel && (
                                    <button
                                        type="button"
                                        onClick={restoreBudget}
                                        className="mt-6 text-sm font-semibold text-primary underline-offset-2 hover:underline"
                                    >
                                        Volver a aplicar {ignoredBudgetLabel}
                                    </button>
                                )}
                            </div>
                        ) : (
                            <>
                                {lowRelevance && (
                                    <div className="mb-8 rounded-2xl border border-sand bg-crema px-5 py-4 text-sm text-ink-soft">
                                        No hay coincidencias exactas con «{query}». Estos son los inmuebles
                                        más parecidos de tu catálogo.
                                    </div>
                                )}

                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-10">
                                    {semanticResults.slice(0, visibleSemantic).map((inmueble, index) => (
                                        <PropertyCard
                                            key={`${inmueble.id}_${index}`}
                                            inmueble={inmueble as unknown as CardInmueble}
                                        />
                                    ))}
                                </div>

                                <div className="mt-10 flex flex-col items-center gap-5">
                                    <p aria-live="polite" className="text-sm text-muted">
                                        Mostrando{' '}
                                        <strong className="text-ink-soft">
                                            {Math.min(visibleSemantic, semanticResults.length)}
                                        </strong>{' '}
                                        de {semanticResults.length}
                                        {semanticResults.length >= SEMANTIC_LIMIT ? '+' : ''}
                                    </p>

                                    {visibleSemantic < semanticResults.length ? (
                                        <button
                                            type="button"
                                            onClick={() => setVisibleSemantic(count => count + SEMANTIC_BATCH)}
                                            className="bg-transparent border-2 border-ink text-ink hover:bg-ink hover:text-white font-sans font-black text-sm uppercase tracking-widest py-4 px-10 rounded-full transition-all duration-300 transform hover:-translate-y-1"
                                        >
                                            Cargar {Math.min(SEMANTIC_BATCH, semanticResults.length - visibleSemantic)} más
                                        </button>
                                    ) : semanticResults.length >= SEMANTIC_LIMIT ? (
                                        <p className="max-w-xl text-center text-sm text-muted">
                                            Estos son los {SEMANTIC_LIMIT} inmuebles más parecidos a «{query}».
                                            Para ver más, cambia a los filtros o añade detalle a tu búsqueda.
                                        </p>
                                    ) : null}

                                    <button
                                        onClick={() => handleSearch(filters, '')}
                                        className="text-primary hover:underline font-bold uppercase tracking-widest text-sm min-h-[44px] px-4"
                                    >
                                        Volver al listado
                                    </button>
                                </div>
                            </>
                        )
                    ) : (
                        <>
                            {loading && page === 0 ? (
                                <SkeletonsGrid count={6} />
                            ) : inmuebles.length === 0 ? (
                                <div className="text-center py-20 text-gray-500">
                                    <p className="text-xl">
                                        No se encontraron {esAlquiler ? 'alquileres' : 'propiedades'} con esos filtros.
                                    </p>
                                    <button
                                        onClick={() => handleSearch({}, '')}
                                        className="mt-6 text-primary hover:underline font-bold uppercase tracking-widest text-sm"
                                    >
                                        Limpiar búsqueda
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-10">
                                        {inmuebles.map((inmueble, index) => (
                                            <PropertyCard
                                                key={`${inmueble.id}_${index}`}
                                                inmueble={inmueble}
                                            />
                                        ))}
                                    </div>

                                    {/* Mostrar Skeletons extra al fondo mientras se carga la siguiente página */}
                                    {loading && page > 0 && (
                                        <div className="mt-10">
                                            <SkeletonsGrid count={3} />
                                        </div>
                                    )}

                                    {/* BOTÓN CARGAR MÁS o ALERTA DE BÚSQUEDA */}
                                    {page < totalPages - 1 && !loading && (
                                        <div className="mt-16 flex justify-center">
                                            {isFiltered || page < 2 ? (
                                                <button
                                                    onClick={() => setPage(p => p + 1)}
                                                    className="bg-transparent border-2 border-ink text-ink hover:bg-ink hover:text-white font-sans font-black text-sm uppercase tracking-widest py-4 px-10 rounded-full transition-all duration-300 transform hover:-translate-y-1"
                                                >
                                                    Cargar más propiedades
                                                </button>
                                            ) : (
                                                <div className="text-center bg-white border border-gray-100 px-8 py-8 rounded-[2rem] w-full max-w-2xl mx-auto shadow-[0_10px_30px_-15px_rgba(0,0,0,0.1)]">
                                                    <button
                                                        onClick={() => document.getElementById('filtro-busqueda')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                                                        className="bg-primary text-white hover:bg-black font-sans font-bold text-sm uppercase tracking-[0.15em] py-4 px-8 rounded-full transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-1"
                                                    >
                                                        Utiliza el Filtro Arriba ↑
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                </>
                            )}
                        </>
                    )}
                </section>
            </main>

            {/* Buscar de nuevo sin subir hasta la píldora del hero */}
            {SEMANTIC_ENABLED && (
                <FloatingSearchBar
                    mode={smartMode ? 'text' : 'filters'}
                    query={query}
                    filterCount={activeFilterCount}
                    operacion={operacion}
                    onChangeOperacion={changeOperacion}
                    onSearch={(text) => handleSearch({}, text)}
                    onOpenFilters={() => {
                        const veniaDeTexto = smartMode;
                        setSmartMode(false);
                        setOpenFiltersToken(token => token + 1);
                        // Desde el modo texto, el atajo devuelve al listado por filtros
                        // (quita el `q` de la URL), igual que el `⚙` de la píldora del hero.
                        if (veniaDeTexto) handleSearch(filters, '');
                    }}
                    onEnableSmartSearch={() => {
                        setSmartMode(true);
                        setFocusSmartToken(token => token + 1);
                        document.getElementById('filtro-busqueda')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }}
                />
            )}

            <Footer />
        </div>
    );
};
