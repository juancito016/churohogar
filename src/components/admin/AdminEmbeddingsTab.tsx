/**
 * ADM-25/26/27 — Estado de los embeddings del catálogo.
 * - ADM-25: total, con vector, sin vector y desactualizados.
 * - ADM-26: reindexar un inmueble o todo el catálogo.
 * - ADM-27: resultado y hora de la última sincronización.
 */

import React, { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
    FaSyncAlt,
    FaRedo,
    FaCheckCircle,
    FaExclamationTriangle,
    FaDatabase,
    FaClock,
    FaSearch,
    FaMapMarkerAlt,
    FaExternalLinkAlt,
} from 'react-icons/fa';
import { useAdminEmbeddings } from '../../hooks/useAdminEmbeddings';
import { useSemanticSearch } from '../../hooks/useSemanticSearch';
import { puedeHacer } from '../../types/rbac';

const numberFormat = new Intl.NumberFormat('es-BO');

const formatMomento = (timestamp: number) =>
    new Date(timestamp).toLocaleString('es-BO', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });

const StatCard: React.FC<{
    label: string;
    value: number;
    hint: string;
    tone: 'neutral' | 'ok' | 'warn' | 'danger';
}> = ({ label, value, hint, tone }) => {
    const tones: Record<typeof tone, string> = {
        neutral: 'text-admin-text',
        ok: 'text-admin-success',
        warn: 'text-admin-warning',
        danger: 'text-admin-danger',
    };

    return (
        <div className="bg-admin-surface p-4 md:p-5 rounded-2xl shadow-sm border border-admin-border">
            <p className="text-xs font-bold uppercase tracking-wide text-admin-muted">{label}</p>
            <p className={`text-3xl font-extrabold mt-2 ${tones[tone]}`}>{numberFormat.format(value)}</p>
            <p className="text-xs text-admin-muted mt-1">{hint}</p>
        </div>
    );
};

export const AdminEmbeddingsTab: React.FC<{
    initialQuery?: string;
    permisos?: string[];
    legacy?: boolean;
}> = ({ initialQuery, permisos = [], legacy = false }) => {
    const puedeReindexar = puedeHacer(permisos, 'embeddings.reindexar', legacy);
    const { stats, pendientes, loading, running, error, lastRun, refresh, reindexAll, reindexOne } =
        useAdminEmbeddings();
    const {
        search,
        data: busqueda,
        loading: buscando,
        error: errorBusqueda,
    } = useSemanticSearch();

    const [consulta, setConsulta] = useState(initialQuery ?? '');
    const [tipo, setTipo] = useState('');
    const [operacion, setOperacion] = useState('');
    const consultaAutomatica = useRef<string | null>(null);

    // Si se llega desde “Buscar por significado”, la consulta ya viene escrita.
    useEffect(() => {
        const texto = (initialQuery ?? '').trim();
        if (texto.length < 3 || consultaAutomatica.current === texto) return;

        consultaAutomatica.current = texto;
        setConsulta(texto);
        search(texto).catch(() => {
            // El error se muestra en `errorBusqueda`.
        });
    }, [initialQuery, search]);

    const sinPendientes = (stats?.sinVector ?? 0) + (stats?.desactualizados ?? 0) === 0;

    const handleBuscar = async (event: React.FormEvent) => {
        event.preventDefault();
        const texto = consulta.trim();
        if (texto.length < 3) return;

        try {
            await search(texto, { tipo, ...(operacion ? { operacion } : {}) });
        } catch {
            // El hook ya expone el mensaje en `errorBusqueda`.
        }
    };

    const handleReindexAll = async () => {
        const loadingToast = toast.loading('Generando embeddings pendientes...');

        try {
            const result = await reindexAll();
            const resumen = `${result.processed} generados · ${result.skipped} sin cambios`;

            if (result.failed > 0) {
                toast.error(`${resumen} · ${result.failed} con error`, { id: loadingToast });
                return;
            }

            toast.success(resumen, { id: loadingToast });
        } catch (reindexError) {
            toast.error(
                reindexError instanceof Error ? reindexError.message : 'No se pudo reindexar.',
                { id: loadingToast }
            );
        }
    };

    const handleReindexOne = async (inmuebleId: string, titulo: string) => {
        const loadingToast = toast.loading(`Reindexando “${titulo}”...`);

        try {
            const result = await reindexOne(inmuebleId);
            const fallo = result.results.find(item => item.status === 'error');

            if (fallo) {
                toast.error(fallo.error ?? 'No se pudo reindexar el inmueble.', { id: loadingToast });
                return;
            }

            toast.success('Inmueble reindexado', { id: loadingToast });
        } catch (reindexError) {
            toast.error(
                reindexError instanceof Error ? reindexError.message : 'No se pudo reindexar.',
                { id: loadingToast }
            );
        }
    };

    return (
        <div className="animate-fade-in-up">
            <div className="mb-6">
                <h2 className="font-serif text-3xl font-bold text-admin-text">Búsqueda semántica</h2>
                <p className="text-admin-muted mt-1">
                    Estado de los vectores que permiten buscar inmuebles por significado.
                </p>
            </div>

            {error && (
                <div role="alert" className="mb-6 flex items-start gap-3 bg-admin-danger-soft border border-admin-danger/30 text-admin-danger p-4 rounded-xl">
                    <FaExclamationTriangle className="mt-1 shrink-0" />
                    <div className="flex-1">
                        <p className="font-bold">No se pudo leer el estado</p>
                        <p className="text-sm">{error}</p>
                    </div>
                    <button
                        type="button"
                        onClick={refresh}
                        disabled={loading}
                        className="shrink-0 text-sm font-bold underline disabled:opacity-60"
                    >
                        Reintentar
                    </button>
                </div>
            )}

            <div className="flex flex-wrap gap-3 mb-6">
                {puedeReindexar && (
                    <button
                        type="button"
                        onClick={handleReindexAll}
                        disabled={loading || running !== null || sinPendientes}
                        aria-busy={running === 'todos'}
                        className="flex items-center gap-2 bg-admin-primary hover:bg-admin-primary-hover text-white font-bold py-3 px-6 rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {running === 'todos' ? <FaSyncAlt className="animate-spin" /> : <FaSyncAlt />}
                        Reindexar pendientes
                    </button>
                )}
                <button
                    type="button"
                    onClick={refresh}
                    disabled={loading || running !== null}
                    aria-busy={loading}
                    className="flex items-center gap-2 bg-admin-surface border border-admin-border text-admin-text font-bold py-3 px-6 rounded-xl hover:bg-admin-surface-2 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <FaRedo className={loading ? 'animate-spin' : undefined} />
                    Actualizar estado
                </button>
            </div>

            <div aria-live="polite" className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <StatCard
                    label="Activos"
                    value={stats?.total ?? 0}
                    hint="Inmuebles disponibles"
                    tone="neutral"
                />
                <StatCard
                    label="Con vector"
                    value={stats?.conVector ?? 0}
                    hint="Listos para buscar"
                    tone="ok"
                />
                <StatCard
                    label="Sin vector"
                    value={stats?.sinVector ?? 0}
                    hint="Nunca sincronizados"
                    tone="warn"
                />
                <StatCard
                    label="Desactualizados"
                    value={stats?.desactualizados ?? 0}
                    hint="Cambiaron desde el último vector"
                    tone={stats && stats.desactualizados > 0 ? 'danger' : 'neutral'}
                />
            </div>

            {lastRun && (
                <div className="flex items-center gap-2 text-sm text-admin-muted mb-6">
                    <FaClock aria-hidden />
                    <span>
                        Última ejecución: {formatMomento(lastRun.finishedAt)} · {numberFormat.format(lastRun.processed)} generados ·{' '}
                        {numberFormat.format(lastRun.skipped)} sin cambios · {numberFormat.format(lastRun.failed)} con error
                        {lastRun.retries ? ` · ${numberFormat.format(lastRun.retries)} reintentos` : ''}
                        {lastRun.pages && lastRun.pages > 1 ? ` · ${lastRun.pages} páginas` : ''}
                    </span>
                </div>
            )}

            {stats?.truncated && (
                <p className="mb-4 text-sm text-admin-warning bg-admin-warning-soft border border-admin-warning/30 p-3 rounded-xl">
                    Se revisaron los primeros {numberFormat.format(stats.total)} inmuebles activos. “Reindexar pendientes”
                    recorre el resto por páginas hasta terminar.
                </p>
            )}

            <section className="bg-admin-surface rounded-2xl shadow-sm border border-admin-border overflow-hidden mb-6">
                <div className="px-4 md:px-6 py-4 border-b border-admin-border flex items-center gap-2">
                    <FaSearch className="text-admin-muted" aria-hidden />
                    <h3 className="font-bold text-admin-text">Probar una búsqueda</h3>
                </div>

                <div className="p-4 md:p-6">
                    <p className="text-sm text-admin-muted mb-4">
                        Escribe como lo haría un visitante. La búsqueda usa los vectores de arriba: si están
                        desactualizados, el resultado también lo estará.
                    </p>

                    <form onSubmit={handleBuscar} className="flex flex-col sm:flex-row gap-3">
                        <div className="flex-1 min-w-0">
                            <label htmlFor="prueba-busqueda" className="sr-only">
                                Texto de la búsqueda
                            </label>
                            <input
                                id="prueba-busqueda"
                                type="search"
                                value={consulta}
                                onChange={event => setConsulta(event.target.value)}
                                placeholder="Ej.: casa con jardín en San Blas"
                                maxLength={200}
                                className="w-full border border-admin-border rounded-xl px-4 py-3 text-admin-text focus:outline-none focus:ring-2 focus:ring-admin-accent/40"
                            />
                        </div>
                        <div>
                            <select
                                id="prueba-operacion"
                                aria-label="Operación"
                                value={operacion}
                                onChange={event => setOperacion(event.target.value)}
                                className="w-full sm:w-40 border border-admin-border rounded-xl px-4 py-3 text-admin-text bg-admin-surface focus:outline-none focus:ring-2 focus:ring-admin-accent/40"
                            >
                                <option value="">Según el texto</option>
                                <option value="Venta">Venta</option>
                                <option value="Alquiler">Alquiler</option>
                            </select>
                        </div>
                        <div>
                            <label htmlFor="prueba-tipo" className="sr-only">
                                Tipo de propiedad
                            </label>
                            <select
                                id="prueba-tipo"
                                value={tipo}
                                onChange={event => setTipo(event.target.value)}
                                className="w-full sm:w-44 border border-admin-border rounded-xl px-4 py-3 text-admin-text bg-admin-surface focus:outline-none focus:ring-2 focus:ring-admin-accent/40"
                            >
                                <option value="">Todo tipo</option>
                                <option value="Casa">Casa</option>
                                <option value="Lote">Lote</option>
                                <option value="Departamento">Departamento</option>
                            </select>
                        </div>
                        <button
                            type="submit"
                            disabled={buscando || consulta.trim().length < 3}
                            aria-busy={buscando}
                            className="flex items-center justify-center gap-2 bg-admin-primary hover:bg-admin-primary-hover text-white font-bold py-3 px-6 rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {buscando ? <FaSyncAlt className="animate-spin" /> : <FaSearch />}
                            Buscar
                        </button>
                    </form>

                    {errorBusqueda && (
                        <p role="alert" className="mt-4 text-sm text-admin-danger bg-admin-danger-soft border border-admin-danger/30 p-3 rounded-xl">
                            {errorBusqueda}
                        </p>
                    )}

                    {busqueda && (
                        <div aria-live="polite" className="mt-5">
                            <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                                <span
                                    className={`px-3 py-1 rounded-full ${
                                        busqueda.cached
                                            ? 'bg-admin-success-soft text-admin-success'
                                            : 'bg-admin-info-soft text-admin-info'
                                    }`}
                                >
                                    {busqueda.cached ? 'Desde caché' : 'Calculada ahora'}
                                </span>
                                <span className="px-3 py-1 rounded-full bg-admin-surface-2 text-admin-text">
                                    {numberFormat.format(busqueda.count)} resultado
                                    {busqueda.count === 1 ? '' : 's'}
                                </span>
                                <span className="px-3 py-1 rounded-full bg-admin-surface-2 text-admin-text">
                                    {numberFormat.format(busqueda.timings.total_ms)} ms
                                </span>
                                {(busqueda.detected.barrio ||
                                    busqueda.detected.ciudad ||
                                    busqueda.detected.departamento) && (
                                    <span className="flex items-center gap-1 px-3 py-1 rounded-full bg-admin-warning-soft text-admin-warning">
                                        <FaMapMarkerAlt aria-hidden />
                                        Zona detectada:{' '}
                                        {[
                                            busqueda.detected.barrio?.nombre,
                                            busqueda.detected.ciudad?.nombre,
                                            busqueda.detected.departamento?.nombre,
                                        ]
                                            .filter(Boolean)
                                            .join(' · ')}
                                    </span>
                                )}
                            </div>

                            {busqueda.results.length === 0 ? (
                                <p className="mt-4 text-sm text-admin-muted">
                                    Ningún inmueble disponible coincide con esa búsqueda.
                                </p>
                            ) : (
                                <ul className="mt-4 divide-y divide-gray-100 border border-admin-border rounded-xl">
                                    {busqueda.results.map(resultado => (
                                        <li
                                            key={resultado.id}
                                            className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-3"
                                        >
                                            <div className="min-w-0 flex-1">
                                                <p className="font-semibold text-admin-text truncate">
                                                    {resultado.titulo}
                                                </p>
                                                <p className="text-xs text-admin-muted truncate">
                                                    {resultado.ubicacion}
                                                </p>
                                            </div>
                                            <span className="text-sm font-bold text-admin-text whitespace-nowrap">
                                                {resultado.moneda} {numberFormat.format(resultado.precio)}
                                            </span>
                                            <span
                                                className="self-start sm:self-auto text-xs font-bold px-2 py-1 rounded-full bg-admin-surface-2 text-admin-muted whitespace-nowrap"
                                                title="Similitud semántica: 1 es idéntico"
                                            >
                                                sim {resultado.similarity.toFixed(3)}
                                            </span>
                                            <a
                                                href={`/inmueble/${resultado.slug}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="self-start sm:self-auto flex items-center gap-1 text-sm font-bold text-admin-accent hover:underline"
                                            >
                                                Ver
                                                <FaExternalLinkAlt size={11} aria-hidden />
                                            </a>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}
                </div>
            </section>

            <section className="bg-admin-surface rounded-2xl shadow-sm border border-admin-border overflow-hidden">
                <div className="px-4 md:px-6 py-4 border-b border-admin-border flex items-center gap-2">
                    <FaDatabase className="text-admin-muted" aria-hidden />
                    <h3 className="font-bold text-admin-text">Inmuebles pendientes de sincronizar</h3>
                </div>

                {loading && !stats ? (
                    <div role="status" aria-label="Cargando estado" className="p-6 space-y-3">
                        {[0, 1, 2].map(row => (
                            <div key={row} className="h-12 bg-admin-surface-2 rounded-xl animate-pulse" />
                        ))}
                    </div>
                ) : pendientes.length === 0 ? (
                    <div className="p-8 text-center">
                        <FaCheckCircle className="text-admin-success text-3xl mx-auto mb-3" aria-hidden />
                        <p className="font-bold text-admin-text">Todo sincronizado</p>
                        <p className="text-sm text-admin-muted mt-1">
                            Todos los inmuebles activos tienen su vector actualizado.
                        </p>
                    </div>
                ) : (
                    <ul className="divide-y divide-gray-100">
                        {pendientes.map(inmueble => (
                            <li
                                key={inmueble.inmueble_id}
                                className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 md:px-6 py-4"
                            >
                                <div className="min-w-0 flex-1">
                                    <p className="font-semibold text-admin-text truncate">{inmueble.titulo}</p>
                                    <p className="text-xs text-admin-muted truncate">{inmueble.slug}</p>
                                </div>
                                <span
                                    className={`self-start sm:self-auto text-xs font-bold px-3 py-1 rounded-full ${
                                        inmueble.has_embedding
                                            ? 'bg-admin-warning-soft text-admin-warning'
                                            : 'bg-admin-surface-2 text-admin-text'
                                    }`}
                                >
                                    {inmueble.has_embedding ? 'Desactualizado' : 'Sin vector'}
                                </span>
                                {puedeReindexar && (
                                    <button
                                        type="button"
                                        onClick={() => handleReindexOne(inmueble.inmueble_id, inmueble.titulo)}
                                        disabled={running !== null}
                                        aria-busy={running === inmueble.inmueble_id}
                                        className="self-start sm:self-auto flex items-center gap-2 text-sm font-bold border border-admin-border rounded-xl px-4 py-2 hover:bg-admin-surface-2 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {running === inmueble.inmueble_id ? (
                                            <FaSyncAlt className="animate-spin" />
                                        ) : (
                                            <FaSyncAlt />
                                        )}
                                        Reindexar
                                    </button>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <p className="mt-6 text-xs text-admin-muted">
                Los vectores se generan en el servidor con Gemini y no se exponen al navegador. Los inmuebles vendidos o
                en papelera no se sincronizan.
            </p>
        </div>
    );
};
