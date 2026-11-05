/**
 * ADM-30 / ADM-29 / ADM-28 — Pestaña “Sistema”.
 * - Configuración del negocio: WhatsApp por defecto, mensaje inicial y SEO.
 * - Estadísticas del catálogo, storage, ubicaciones y embeddings.
 * - Estado de la caché de búsquedas y purga manual.
 * - Limpieza de archivos huérfanos del Storage.
 */

import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
    FaSave,
    FaSyncAlt,
    FaDatabase,
    FaTrashAlt,
    FaExclamationTriangle,
    FaWhatsapp,
    FaGlobe,
    FaImages,
    FaMapMarkerAlt,
    FaBrain,
} from 'react-icons/fa';
import { supabase } from '../../services/supabaseClient';
import { StorageCleaner } from '../StorageCleaner';
import { puedeHacer } from '../../types/rbac';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { mensajeError } from '../../utils/errors';
import {
    DEFAULT_BUSINESS_CONFIG,
    invalidateBusinessConfig,
    useBusinessConfig,
} from '../../hooks/useBusinessConfig';
import { useAdminSystem } from '../../hooks/useAdminSystem';

const numberFormat = new Intl.NumberFormat('es-BO');

const formatBytes = (bytes: number) => {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / Math.pow(1024, index);
    return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};

const formatMomento = (value: string | null) => {
    if (!value) return 'Sin registros';
    return new Date(value).toLocaleString('es-BO', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
};

const StatCard: React.FC<{
    label: string;
    value: string;
    hint: string;
    icon: React.ReactNode;
}> = ({ label, value, hint, icon }) => (
    <div className="bg-admin-surface p-4 md:p-5 rounded-2xl shadow-sm border border-admin-border">
        <div className="flex items-center gap-2 text-admin-muted">
            {icon}
            <p className="text-xs font-bold uppercase tracking-wide">{label}</p>
        </div>
        <p className="text-3xl font-extrabold mt-2 text-admin-text">{value}</p>
        <p className="text-xs text-admin-muted mt-1">{hint}</p>
    </div>
);

type ConfigForm = {
    whatsapp: string;
    mensajeWhatsapp: string;
    seoTitulo: string;
    seoDescripcion: string;
};

const toForm = (config: typeof DEFAULT_BUSINESS_CONFIG): ConfigForm => ({
    whatsapp: config.whatsapp,
    mensajeWhatsapp: config.mensajeWhatsapp,
    seoTitulo: config.seoTitulo,
    seoDescripcion: config.seoDescripcion,
});

const validar = (form: ConfigForm): string | null => {
    const whatsapp = form.whatsapp.replace(/\D/g, '');
    if (!/^[0-9]{8,15}$/.test(whatsapp)) {
        return 'El WhatsApp debe tener entre 8 y 15 dígitos, con código de país.';
    }

    const titulo = form.seoTitulo.trim();
    if (titulo.length < 10 || titulo.length > 120) {
        return 'El título SEO debe tener entre 10 y 120 caracteres.';
    }

    const descripcion = form.seoDescripcion.trim();
    if (descripcion.length < 40 || descripcion.length > 320) {
        return 'La descripción SEO debe tener entre 40 y 320 caracteres.';
    }

    const mensaje = form.mensajeWhatsapp.trim();
    if (mensaje.length < 5 || mensaje.length > 200) {
        return 'El mensaje de WhatsApp debe tener entre 5 y 200 caracteres.';
    }

    return null;
};

interface AdminSystemTabProps {
    permisos?: string[];
    legacy?: boolean;
}

export const AdminSystemTab: React.FC<AdminSystemTabProps> = ({ permisos = [], legacy = false }) => {
    const puede = (clave: string) => puedeHacer(permisos, clave, legacy);
    const verConfiguracion = puede('configuracion.ver');
    const editarConfiguracion = puede('configuracion.editar');
    const verEstadisticas = puede('estadisticas.ver');
    const verCache = puede('cache.ver');
    const purgarCache = puede('cache.purgar');

    const { config, loading: loadingConfig, error: configError, refresh: refreshConfig } =
        useBusinessConfig();
    const { stats, cache, loading, error, purging, refresh, purge } = useAdminSystem({
        estadisticas: verEstadisticas,
        cache: verCache,
    });

    const [form, setForm] = useState<ConfigForm>(() => toForm(config));
    const [saving, setSaving] = useState(false);
    const [confirmPurge, setConfirmPurge] = useState<'expiradas' | 'todo' | null>(null);

    // La configuración puede llegar después del primer render (caché vacía).
    useEffect(() => {
        setForm(toForm(config));
    }, [config]);

    const hasChanges = useMemo(() => {
        const original = toForm(config);
        return (Object.keys(original) as (keyof ConfigForm)[]).some(
            key => form[key].trim() !== original[key].trim()
        );
    }, [config, form]);

    const handleChange = (
        event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => {
        const { name, value } = event.target;
        setForm(prev => ({ ...prev, [name]: value }));
    };

    const handleSave = async (event: React.FormEvent) => {
        event.preventDefault();

        const validation = validar(form);
        if (validation) {
            toast.error(validation);
            return;
        }

        setSaving(true);
        const toastId = toast.loading('Guardando configuración...');

        try {
            const { error: updateError } = await supabase
                .from('configuracion_negocio')
                .update({
                    whatsapp: form.whatsapp.replace(/\D/g, ''),
                    mensaje_whatsapp: form.mensajeWhatsapp.trim(),
                    seo_titulo: form.seoTitulo.trim(),
                    seo_descripcion: form.seoDescripcion.trim(),
                })
                .eq('id', true);

            if (updateError) throw new Error(updateError.message);

            invalidateBusinessConfig();
            await refreshConfig();
            toast.success('Configuración guardada', { id: toastId });
        } catch (saveError) {
            toast.error(mensajeError(saveError, 'No se pudo guardar la configuración. Reintenta.'), {
                id: toastId,
            });
        } finally {
            setSaving(false);
        }
    };

    const handlePurge = async () => {
        if (!confirmPurge) return;

        const modo = confirmPurge;
        setConfirmPurge(null);
        const toastId = toast.loading('Purgando caché...');

        try {
            const borradas = await purge(modo === 'expiradas');
            toast.success(
                borradas === 0
                    ? 'No había entradas que borrar'
                    : `${numberFormat.format(borradas)} entrada(s) eliminada(s)`,
                { id: toastId }
            );
        } catch (purgeError) {
            toast.error(mensajeError(purgeError, 'No se pudo purgar la caché. Reintenta.'), {
                id: toastId,
            });
        }
    };

    return (
        <div className="animate-fade-in-up space-y-8">
            <div>
                <h2 className="font-serif text-3xl font-bold text-admin-text">Sistema</h2>
                <p className="text-admin-muted mt-1">
                    Configuración del negocio, estadísticas, caché de búsquedas y mantenimiento.
                </p>
            </div>

            {/* ADM-30 — Configuración del negocio */}
            {verConfiguracion && (
            <section className="bg-admin-surface rounded-2xl shadow-sm border border-admin-border p-4 md:p-6">
                <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
                    <div>
                        <h3 className="font-serif text-xl font-bold text-admin-text">Configuración del negocio</h3>
                        <p className="text-sm text-admin-muted">
                            Se aplica en la portada, en las fichas y como valor sugerido al publicar.
                        </p>
                    </div>
                    <span className="text-xs text-admin-muted">
                        Actualizado: {formatMomento(config.actualizadoAt)}
                    </span>
                </div>

                {configError && (
                    <div className="mb-4 flex items-center gap-2 rounded-xl bg-admin-danger-soft text-admin-danger px-4 py-3 text-sm">
                        <FaExclamationTriangle />
                        {configError}
                    </div>
                )}

                <form onSubmit={handleSave} className="space-y-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label
                                htmlFor="config-whatsapp"
                                className="flex items-center gap-2 text-sm font-bold text-admin-text mb-1"
                            >
                                <FaWhatsapp className="text-admin-success" /> WhatsApp por defecto
                            </label>
                            <input
                                id="config-whatsapp"
                                name="whatsapp"
                                value={form.whatsapp}
                                onChange={handleChange}
                                inputMode="numeric"
                                placeholder="59170012345"
                                className="w-full px-3 py-2.5 rounded-xl border border-admin-border focus:outline-none focus:ring-2 focus:ring-admin-accent/30"
                            />
                            <p className="text-xs text-admin-muted mt-1">
                                Con código de país y sin espacios. Se usa cuando un inmueble no tiene
                                contacto propio.
                            </p>
                        </div>

                        <div>
                            <label
                                htmlFor="config-mensaje"
                                className="block text-sm font-bold text-admin-text mb-1"
                            >
                                Saludo del mensaje de WhatsApp
                            </label>
                            <input
                                id="config-mensaje"
                                name="mensajeWhatsapp"
                                value={form.mensajeWhatsapp}
                                onChange={handleChange}
                                placeholder="¡Hola ChuroHogar! Me interesa este inmueble:"
                                className="w-full px-3 py-2.5 rounded-xl border border-admin-border focus:outline-none focus:ring-2 focus:ring-admin-accent/30"
                            />
                            <p className="text-xs text-admin-muted mt-1">
                                Los datos del inmueble se añaden automáticamente debajo.
                            </p>
                        </div>
                    </div>

                    <div>
                        <label
                            htmlFor="config-seo-titulo"
                            className="flex items-center gap-2 text-sm font-bold text-admin-text mb-1"
                        >
                            <FaGlobe className="text-admin-accent" /> Título SEO de la portada
                        </label>
                        <input
                            id="config-seo-titulo"
                            name="seoTitulo"
                            value={form.seoTitulo}
                            onChange={handleChange}
                            maxLength={120}
                            className="w-full px-3 py-2.5 rounded-xl border border-admin-border focus:outline-none focus:ring-2 focus:ring-admin-accent/30"
                        />
                        <p className="text-xs text-admin-muted mt-1">
                            {form.seoTitulo.trim().length}/120 caracteres · aparece en la pestaña y en
                            Google.
                        </p>
                    </div>

                    <div>
                        <label
                            htmlFor="config-seo-descripcion"
                            className="block text-sm font-bold text-admin-text mb-1"
                        >
                            Descripción SEO de la portada
                        </label>
                        <textarea
                            id="config-seo-descripcion"
                            name="seoDescripcion"
                            value={form.seoDescripcion}
                            onChange={handleChange}
                            rows={3}
                            maxLength={320}
                            className="w-full px-3 py-2.5 rounded-xl border border-admin-border focus:outline-none focus:ring-2 focus:ring-admin-accent/30 resize-y"
                        />
                        <p className="text-xs text-admin-muted mt-1">
                            {form.seoDescripcion.trim().length}/320 caracteres.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        <button
                            type="submit"
                            disabled={saving || loadingConfig || !hasChanges || !editarConfiguracion}
                            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-admin-primary text-white font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <FaSave /> {saving ? 'Guardando...' : 'Guardar cambios'}
                        </button>
                        {hasChanges && !saving && (
                            <span className="text-sm text-admin-warning font-medium flex items-center gap-1">
                                <FaExclamationTriangle /> Hay cambios sin guardar
                            </span>
                        )}
                    </div>
                </form>
            </section>
            )}

            {/* ADM-29 — Estadísticas */}
            {verEstadisticas && (
            <section>
                <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
                    <div>
                        <h3 className="font-serif text-xl font-bold text-admin-text">Estadísticas</h3>
                        <p className="text-sm text-admin-muted">
                            Conteos reales del catálogo, el almacenamiento y la búsqueda.
                        </p>
                    </div>
                    <button
                        onClick={refresh}
                        disabled={loading}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl border border-admin-border bg-admin-surface text-admin-text font-semibold text-sm hover:bg-admin-surface-2 disabled:opacity-50"
                    >
                        <FaSyncAlt className={loading ? 'animate-spin' : ''} /> Actualizar
                    </button>
                </div>

                {error && (
                    <div className="mb-4 flex items-center gap-2 rounded-xl bg-admin-danger-soft text-admin-danger px-4 py-3 text-sm">
                        <FaExclamationTriangle />
                        {error}
                    </div>
                )}

                {stats && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <StatCard
                            label="Disponibles"
                            value={numberFormat.format(stats.inmuebles.activos)}
                            hint={`${stats.inmuebles.total} en total · ${stats.inmuebles.vendidos} vendidos · ${stats.inmuebles.alquilados ?? 0} alquilados`}
                            icon={<FaDatabase />}
                        />
                        <StatCard
                            label="Venta / Alquiler"
                            value={`${numberFormat.format(stats.operacion?.venta ?? 0)} / ${numberFormat.format(stats.operacion?.alquiler ?? 0)}`}
                            hint="Inmuebles publicados en venta y en alquiler"
                            icon={<FaDatabase />}
                        />
                        <StatCard
                            label="Vencidos / Papelera"
                            value={`${numberFormat.format(stats.inmuebles.vencidos)} / ${numberFormat.format(stats.inmuebles.papelera)}`}
                            hint="Publicaciones inactivas y eliminadas"
                            icon={<FaExclamationTriangle />}
                        />
                        <StatCard
                            label="Fotos"
                            value={numberFormat.format(stats.storage.archivos)}
                            hint={`${formatBytes(stats.storage.bytes)} en Storage · ${numberFormat.format(stats.imagenes)} filas`}
                            icon={<FaImages />}
                        />
                        <StatCard
                            label="Embeddings"
                            value={`${numberFormat.format(stats.embeddings.conVector)} / ${numberFormat.format(stats.embeddings.total)}`}
                            hint="Inmuebles con vector de búsqueda"
                            icon={<FaBrain />}
                        />
                        <StatCard
                            label="Ubicaciones"
                            value={numberFormat.format(
                                stats.ubicaciones.departamentos +
                                    stats.ubicaciones.ciudades +
                                    stats.ubicaciones.barrios
                            )}
                            hint={`${stats.ubicaciones.departamentos} deptos · ${stats.ubicaciones.ciudades} ciudades · ${stats.ubicaciones.barrios} barrios`}
                            icon={<FaMapMarkerAlt />}
                        />
                    </div>
                )}
                {loading && !stats && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {[0, 1, 2, 3].map(item => (
                            <div
                                key={item}
                                className="bg-admin-surface p-5 rounded-2xl border border-admin-border h-28 animate-pulse"
                            />
                        ))}
                    </div>
                )}
            </section>
            )}

            {/* ADM-28 — Caché de búsquedas */}
            {verCache && (
            <section className="bg-admin-surface rounded-2xl shadow-sm border border-admin-border p-4 md:p-6">
                <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
                    <div>
                        <h3 className="font-serif text-xl font-bold text-admin-text">Caché de búsquedas</h3>
                        <p className="text-sm text-admin-muted">
                            Cada búsqueda repetida se responde desde aquí sin llamar a Gemini.
                        </p>
                    </div>
                    {cache && (
                        <span className="text-xs text-admin-muted">
                            Última consulta: {formatMomento(cache.ultimaConsulta)}
                        </span>
                    )}
                </div>

                {cache && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
                        <div className="rounded-xl bg-admin-surface-2 p-3">
                            <p className="text-xs text-admin-muted font-semibold">Entradas</p>
                            <p className="text-2xl font-extrabold text-admin-text">
                                {numberFormat.format(cache.total)}
                            </p>
                        </div>
                        <div className="rounded-xl bg-admin-success-soft p-3">
                            <p className="text-xs text-admin-success font-semibold">Vigentes</p>
                            <p className="text-2xl font-extrabold text-admin-success">
                                {numberFormat.format(cache.vigentes)}
                            </p>
                        </div>
                        <div className="rounded-xl bg-admin-warning-soft p-3">
                            <p className="text-xs text-admin-warning font-semibold">Expiradas</p>
                            <p className="text-2xl font-extrabold text-admin-warning">
                                {numberFormat.format(cache.expiradas)}
                            </p>
                        </div>
                        <div className="rounded-xl bg-admin-info-soft p-3">
                            <p className="text-xs text-admin-info font-semibold">Aciertos</p>
                            <p className="text-2xl font-extrabold text-admin-info">
                                {numberFormat.format(cache.hits)}
                            </p>
                            <p className="text-[11px] text-admin-info/80">
                                {cache.consultasConHit} consulta(s) reutilizada(s)
                            </p>
                        </div>
                        <div className="rounded-xl bg-admin-surface-2 p-3">
                            <p className="text-xs text-admin-muted font-semibold">Tamaño</p>
                            <p className="text-2xl font-extrabold text-admin-text">
                                {formatBytes(cache.bytesAproximados)}
                            </p>
                            <p className="text-[11px] text-admin-muted">
                                data_version {cache.dataVersion}
                            </p>
                        </div>
                    </div>
                )}

                <div className="flex flex-wrap gap-3">
                    <button
                        onClick={() => setConfirmPurge('expiradas')}
                        disabled={purging || loading || !cache || cache.expiradas === 0 || !purgarCache}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-admin-warning text-admin-bg font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <FaTrashAlt /> Purgar expiradas
                    </button>
                    <button
                        onClick={() => setConfirmPurge('todo')}
                        disabled={purging || loading || !cache || cache.total === 0 || !purgarCache}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-admin-danger-strong text-white font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <FaTrashAlt /> Vaciar toda la caché
                    </button>
                </div>

                <p className="text-xs text-admin-muted mt-3">
                    Vaciar la caché no borra inmuebles ni embeddings: la próxima búsqueda se calcula de
                    nuevo. Las entradas caducan solas a las 24 horas.
                </p>

                <ConfirmDialog
                    open={confirmPurge !== null}
                    title={confirmPurge === 'todo' ? '¿Vaciar toda la caché?' : '¿Purgar expiradas?'}
                    description={
                        confirmPurge === 'todo'
                            ? 'Se borrarán todas las búsquedas guardadas. La siguiente consulta tardará lo normal (Gemini + catálogo).'
                            : 'Solo se borrarán las entradas que ya caducaron. Las vigentes siguen respondiendo al instante.'
                    }
                    confirmLabel={confirmPurge === 'todo' ? 'Vaciar caché' : 'Purgar expiradas'}
                    tone={confirmPurge === 'todo' ? 'danger' : 'warning'}
                    loading={purging}
                    onCancel={() => setConfirmPurge(null)}
                    onConfirm={handlePurge}
                />
            </section>
            )}

            {/* Mantenimiento de Storage */}
            {purgarCache && (
            <section>
                <div className="mb-4">
                    <h3 className="font-serif text-xl font-bold text-admin-text">Mantenimiento del Storage</h3>
                    <p className="text-sm text-admin-muted">
                        Revisa y limpia fotos que ya no pertenecen a ningún inmueble.
                    </p>
                </div>
                <StorageCleaner />
            </section>
            )}
        </div>
    );
};
