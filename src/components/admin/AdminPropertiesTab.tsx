/**
 * AdminPropertiesTab Component
 * 
 * Pestaña del panel administrativo para gestionar inmuebles.
 * Funcionalidades:
 * - Listar todos los inmuebles del catálogo
 * - Buscar por título
 * - Filtrar por departamento, ciudad y estado
 * - Paginación
 * - Crear nuevo inmueble
 * - Editar inmueble existente
 * - Cambiar estado (Disponible ↔ Vendido)
 * - Eliminar inmueble
 */

import React, { useRef, useState } from 'react';
import { FaPlus, FaSearch, FaTrash, FaEdit, FaEye, FaUndo, FaSyncAlt, FaClock, FaExclamationTriangle, FaStar, FaRegStar, FaSlidersH } from 'react-icons/fa';
import { useAdminInmuebles, type VistaAdmin } from '../../hooks/useAdminInmuebles';
import { getImageUrl, formatPrecio, formatFecha } from '../../utils/helpers';
import { describirVencimiento } from '../../utils/publication';
import { mensajeError } from '../../utils/errors';
import { puedeHacer } from '../../types/rbac';
import toast from 'react-hot-toast';
import { InmuebleForm } from '../InmuebleForm';
import { AccessibleModal } from '../ui/AccessibleModal';
import { ConfirmDialog } from '../ui/ConfirmDialog';

const getPortada = (imagenes: { url_storage: string; orden?: number | null }[] | null | undefined) =>
    [...(imagenes || [])].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))[0];

/**
 * Props para el componente AdminPropertiesTab
 * 
 * @interface Props
 * @property {string} adminId - ID del administrador/usuario autenticado
 *           Usado como auditoría del creador al publicar un inmueble
 * 
 * @property {any[]} departamentos - Lista de todos los departamentos disponibles
 *           Usado en el selector de filtros para búsqueda por ubicación
 *           Estructura: { id: string, nombre: string }[]
 * 
 * @property {any[]} ciudades - Lista de todas las ciudades disponibles
 *           Usado en el selector de filtros para búsqueda por ciudad
 *           Estructura: { id: string, nombre: string, departamento_id: string }[]
 * 
 * @description
 * Este componente maneja toda la interfaz de administración de propiedades.
 * Comunica con:
 * - Hook useAdminInmuebles: para CRUD y búsqueda
 * - Componente InmuebleForm: para crear/editar modales
 * - Toasts: para manejar notificaciones al usuario
 * 
 * @example
 * <AdminPropertiesTab
 *   adminId="admin-123"
 *   departamentos={deptoList}
 *   ciudades={ciudadList}
 * />
 */
interface Props {
    adminId: string;
    departamentos: any[];
    ciudades: any[];
    /** Lleva el texto al buscador semántico cuando el filtro por título no encuentra nada. */
    onProbarBusqueda?: (query: string) => void;
    /** Permisos del administrador logueado (ADM-41). */
    permisos?: string[];
    /** Si la RPC de permisos falla, se mantiene el comportamiento anterior. */
    legacy?: boolean;
}

type Confirmacion = {
    title: string;
    description: string;
    confirmLabel: string;
    tone?: 'danger' | 'warning' | 'primary';
    action: () => void | Promise<void>;
};

export const AdminPropertiesTab: React.FC<Props> = ({
    adminId,
    departamentos,
    ciudades,
    onProbarBusqueda,
    permisos = [],
    legacy = false,
}) => {
    const puede = (clave: string) => puedeHacer(permisos, clave, legacy);
    const verTodos = puede('inmuebles.ver.todos');
    const puedeCrear = puede('inmuebles.crear');
    const puedeEditar = puede('inmuebles.editar') || puede('inmuebles.editar.propios');
    const puedeEliminar = puede('inmuebles.eliminar');
    const puedePapelera = puede('inmuebles.papelera');
    const puedeEstado = puede('inmuebles.cambiar_estado');
    const puedeDestacar = puede('inmuebles.destacar');
    const puedeRenovar = puede('inmuebles.renovar');
    // Filtros locales
    const [searchTerm, setSearchTerm] = useState('');
    const [filterDepto, setFilterDepto] = useState('');
    const [filterCiudad, setFilterCiudad] = useState('');
    const [page, setPage] = useState(0);
    const [view, setView] = useState<VistaAdmin>('activos');
    /** Filtra por operación dentro de las pestañas (venta o alquiler). */
    const [filterOperacion, setFilterOperacion] = useState('');
    /** Filtra los activos que vencen en los próximos 3 días. */
    const [soloPorVencer, setSoloPorVencer] = useState(false);
    /** En móvil, los filtros de operación/ubicación se pliegan tras un botón. */
    const [showMobileFilters, setShowMobileFilters] = useState(false);

    const filtrosActivos = [filterOperacion, filterDepto, filterCiudad].filter(Boolean).length;

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingInmueble, setEditingInmueble] = useState<any>(null);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [bulkLoading, setBulkLoading] = useState(false);
    const [confirmacion, setConfirmacion] = useState<Confirmacion | null>(null);
    const [confirmando, setConfirmando] = useState(false);
    const formCloseRef = useRef<() => void>(() => { });

    const pedirConfirmacion = (config: Confirmacion) => setConfirmacion(config);

    const ejecutarConfirmacion = async () => {
        if (!confirmacion) return;
        setConfirmando(true);
        try {
            await confirmacion.action();
        } finally {
            setConfirmando(false);
            setConfirmacion(null);
        }
    };

    // Llama al hook con los parámetros actualizados
    const {
        inmuebles, loading, error, total, porVencer, totalPages,
        fetchInmuebles, toggleEstado, toggleDestacado, renovarPublicaciones, moverAPapelera, restaurarInmueble, eliminarDefinitivamente,
        cambiarEstadoMasivo, moverAPapeleraMasivo, restaurarMasivo, eliminarDefinitivamenteMasivo
    } = useAdminInmuebles(page, searchTerm, filterDepto, filterCiudad, view, soloPorVencer, filterOperacion, verTodos ? '' : adminId);

    const openModal = (inmueble?: any) => {
        setEditingInmueble(inmueble || null);
        setIsModalOpen(true);
    };

    const handleToggle = async (id: string, estado: 'Disponible' | 'Vendido' | 'Alquilado' | 'Vencido', operacion: 'Venta' | 'Alquiler') => {
        try {
            const nuevo = await toggleEstado(id, estado, operacion);
            toast.success(`Estado cambiado a ${nuevo}`);
        } catch (toggleError) {
            toast.error(mensajeError(toggleError, 'No se pudo cambiar el estado. Reintenta.'));
        }
    };

    const handleDestacar = async (id: string, actual: boolean) => {
        try {
            const nuevo = await toggleDestacado(id, actual);
            toast.success(nuevo ? 'Marcado como destacado.' : 'Ya no está destacado.');
        } catch (toggleError) {
            toast.error(mensajeError(toggleError, 'No se pudo cambiar el destacado. Reintenta.'));
        }
    };

    /**
     * Renueva publicaciones. `dias = null` las deja permanentes.
     * Se usa tanto para una fila como para la selección múltiple.
     */
    const ejecutarRenovar = async (dias: number | null, ids: string[]) => {
        setBulkLoading(true);
        const loadingToast = toast.loading(
            dias === null ? 'Haciendo permanente…' : `Renovando ${dias} días…`
        );
        try {
            const count = await renovarPublicaciones(ids, dias);
            toast.success(
                dias === null
                    ? `${count} publicación(es) ahora son permanentes`
                    : `${count} publicación(es) renovadas por ${dias} días`,
                { id: loadingToast }
            );
            setSelectedIds([]);
        } catch (error) {
            toast.error(mensajeError(error, 'No se pudo renovar. Revisa tu conexión y reintenta.'), { id: loadingToast });
        } finally {
            setBulkLoading(false);
        }
    };

    const handleRenovar = (dias: number | null, ids: string[] = selectedIds) => {
        if (ids.length === 0) return;

        if (dias === null) {
            const plural = ids.length === 1 ? 'esta publicación' : `${ids.length} publicaciones`;
            pedirConfirmacion({
                title: 'Hacer permanente',
                description: `¿Dejar ${plural} como permanente(s), sin fecha de vencimiento? Dejará de desaparecer automáticamente de la web.`,
                confirmLabel: 'Hacer permanente',
                tone: 'warning',
                action: () => ejecutarRenovar(null, ids),
            });
            return;
        }

        void ejecutarRenovar(dias, ids);
    };

    const ejecutarMoverAPapelera = async (id: string) => {
        const loadingToast = toast.loading('Moviendo a la papelera...');
        try {
            await moverAPapelera(id);
            setSelectedIds(prev => prev.filter(selected => selected !== id));
            toast.success('Inmueble movido a la papelera', { id: loadingToast });
        } catch (error) {
            toast.error(mensajeError(error, 'No se pudo mover a la papelera. Reintenta.'), { id: loadingToast });
        }
    };

    const handleMoverAPapelera = (id: string) => {
        pedirConfirmacion({
            title: 'Mover a la papelera',
            description: 'El inmueble dejará de verse en la web y sus fotos se conservarán. Podrás restaurarlo desde la papelera.',
            confirmLabel: 'Mover a papelera',
            tone: 'warning',
            action: () => ejecutarMoverAPapelera(id),
        });
    };

    const handleRestaurar = async (id: string) => {
        const loadingToast = toast.loading('Restaurando...');
        try {
            await restaurarInmueble(id);
            setSelectedIds(prev => prev.filter(selected => selected !== id));
            toast.success('Inmueble restaurado', { id: loadingToast });
        } catch (error) {
            toast.error(mensajeError(error, 'No se pudo restaurar el inmueble. Reintenta.'), { id: loadingToast });
        }
    };

    const ejecutarEliminarDefinitivamente = async (id: string) => {
        const loadingToast = toast.loading('Eliminando...');
        try {
            await eliminarDefinitivamente(id);
            setSelectedIds(prev => prev.filter(selected => selected !== id));
            toast.success('Inmueble eliminado', { id: loadingToast });
        } catch (error) {
            toast.error(mensajeError(error, 'No se pudo eliminar el inmueble. Reintenta.'), { id: loadingToast });
        }
    };

    const handleEliminarDefinitivamente = (id: string) => {
        pedirConfirmacion({
            title: 'Eliminar definitivamente',
            description: 'También se borrarán sus fotos. Esta acción no se puede deshacer.',
            confirmLabel: 'Eliminar definitivamente',
            tone: 'danger',
            action: () => ejecutarEliminarDefinitivamente(id),
        });
    };

    const allSelected = inmuebles.length > 0 && inmuebles.every(inv => selectedIds.includes(inv.id));

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);
    };

    const toggleSelectAll = () => {
        setSelectedIds(allSelected ? [] : inmuebles.map(inv => inv.id));
    };

    const limpiarSeleccion = () => setSelectedIds([]);

    const cambiarPagina = (nuevaPagina: number) => {
        setSelectedIds([]);
        setPage(nuevaPagina);
    };

    const handleBulkEstado = async (estado: 'Disponible' | 'Vendido' | 'Alquilado') => {
        if (selectedIds.length === 0) return;
        setBulkLoading(true);
        const loadingToast = toast.loading(`Actualizando ${selectedIds.length} inmueble(s)...`);
        try {
            const count = await cambiarEstadoMasivo(selectedIds, estado);
            toast.success(`${count} inmueble(s) actualizados a ${estado}`, { id: loadingToast });
            setSelectedIds([]);
        } catch (error) {
            toast.error(mensajeError(error, 'No se pudieron actualizar los inmuebles. Reintenta.'), { id: loadingToast });
        } finally {
            setBulkLoading(false);
        }
    };

    const ejecutarBulkMoverAPapelera = async () => {
        setBulkLoading(true);
        const loadingToast = toast.loading('Moviendo a la papelera...');
        try {
            const count = await moverAPapeleraMasivo(selectedIds);
            toast.success(`${count} inmueble(s) movidos a la papelera`, { id: loadingToast });
            setSelectedIds([]);
        } catch (error) {
            toast.error(mensajeError(error, 'No se pudieron mover a la papelera. Reintenta.'), { id: loadingToast });
        } finally {
            setBulkLoading(false);
        }
    };

    const handleBulkMoverAPapelera = () => {
        if (selectedIds.length === 0) return;
        pedirConfirmacion({
            title: 'Mover a la papelera',
            description: `¿Mover ${selectedIds.length} inmueble(s) a la papelera? Dejarán de verse en la web y podrás restaurarlos después.`,
            confirmLabel: 'Mover a papelera',
            tone: 'warning',
            action: ejecutarBulkMoverAPapelera,
        });
    };

    const handleBulkRestaurar = async () => {
        if (selectedIds.length === 0) return;
        setBulkLoading(true);
        const loadingToast = toast.loading('Restaurando...');
        try {
            const count = await restaurarMasivo(selectedIds);
            toast.success(`${count} inmueble(s) restaurados`, { id: loadingToast });
            setSelectedIds([]);
        } catch (error) {
            toast.error(mensajeError(error, 'No se pudieron restaurar los inmuebles. Reintenta.'), { id: loadingToast });
        } finally {
            setBulkLoading(false);
        }
    };

    const ejecutarBulkEliminarDefinitivamente = async () => {
        setBulkLoading(true);
        const loadingToast = toast.loading('Eliminando...');
        try {
            const count = await eliminarDefinitivamenteMasivo(selectedIds);
            toast.success(`${count} inmueble(s) eliminados`, { id: loadingToast });
            setSelectedIds([]);
        } catch (error) {
            toast.error(mensajeError(error, 'No se pudieron eliminar los inmuebles. Reintenta.'), { id: loadingToast });
        } finally {
            setBulkLoading(false);
        }
    };

    const handleBulkEliminarDefinitivamente = () => {
        if (selectedIds.length === 0) return;
        pedirConfirmacion({
            title: 'Eliminar definitivamente',
            description: `¿Eliminar definitivamente ${selectedIds.length} inmueble(s)? También se borrarán sus fotos y no se podrá deshacer.`,
            confirmLabel: 'Eliminar definitivamente',
            tone: 'danger',
            action: ejecutarBulkEliminarDefinitivamente,
        });
    };

    const cambiarVista = (nuevaVista: VistaAdmin) => {
        setView(nuevaVista);
        setSoloPorVencer(false);
        setFilterOperacion('');
        setSelectedIds([]);
        setPage(0);
    };

    const alternarPorVencer = () => {
        setSoloPorVencer(prev => !prev);
        setSelectedIds([]);
        setPage(0);
    };

    const verPorVencer = () => {
        setView('activos');
        setSoloPorVencer(true);
        setSelectedIds([]);
        setPage(0);
    };

    const ciudadesFiltradasAdmin = filterDepto ? ciudades.filter(c => c.departamento_id === filterDepto) : [];

    return (
        <>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 gap-4">
                <div>
                    <h2 className="font-serif text-3xl font-bold text-admin-text">
                        {view === 'activos' ? 'Tus Publicaciones'
                            : view === 'vendidos' ? 'Vendidos'
                                : view === 'alquilados' ? 'Alquilados'
                                    : view === 'vencidos' ? 'Publicaciones vencidas'
                                        : 'Papelera'}
                    </h2>
                    <p className="text-admin-muted mt-1">
                        {view === 'activos' && (
                            <>Gestiona tu catálogo. Total activo: <span className="font-bold text-admin-text">{total}</span> inmuebles.</>
                        )}
                        {view === 'vendidos' && (
                            <>Inmuebles vendidos. Puedes devolverlos a Disponible o moverlos a la papelera.</>
                        )}
                        {view === 'alquilados' && (
                            <>Alquileres ya cerrados. Puedes devolverlos a Disponible o moverlos a la papelera.</>
                        )}
                        {view === 'vencidos' && (
                            <>Su tiempo de publicación terminó y ya no se ven en la web. Renueva para volver a publicarlas.</>
                        )}
                        {view === 'papelera' && (
                            <>Inmuebles eliminados. Puedes restaurarlos o borrarlos definitivamente.</>
                        )}
                    </p>
                </div>
                {view === 'activos' && puedeCrear && (
                    <button
                        onClick={() => openModal()}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-admin-primary px-6 py-3 font-bold text-white shadow-md transition hover:-translate-y-1 hover:bg-admin-primary-hover md:w-auto"
                    >
                        <FaPlus /> Publicar Nuevo
                    </button>
                )}
            </div>

            <div className="flex gap-2 mb-4 overflow-x-auto whitespace-nowrap scrollbar-hide -mx-1 px-1" role="tablist" aria-label="Vista de inmuebles">
                <button
                    role="tab"
                    aria-selected={view === 'activos'}
                    onClick={() => cambiarVista('activos')}
                    className={`shrink-0 px-4 py-2 rounded-xl text-sm font-bold border transition ${view === 'activos' ? 'bg-admin-accent text-admin-bg border-admin-accent' : 'bg-admin-surface text-admin-muted border-admin-border hover:bg-admin-surface-2'}`}
                >
                    Activos
                </button>
                <button
                    role="tab"
                    aria-selected={view === 'vendidos'}
                    onClick={() => cambiarVista('vendidos')}
                    className={`shrink-0 px-4 py-2 rounded-xl text-sm font-bold border transition ${view === 'vendidos' ? 'bg-admin-accent text-admin-bg border-admin-accent' : 'bg-admin-surface text-admin-muted border-admin-border hover:bg-admin-surface-2'}`}
                >
                    Vendidos
                </button>
                <button
                    role="tab"
                    aria-selected={view === 'alquilados'}
                    onClick={() => cambiarVista('alquilados')}
                    className={`shrink-0 px-4 py-2 rounded-xl text-sm font-bold border transition ${view === 'alquilados' ? 'bg-admin-accent text-admin-bg border-admin-accent' : 'bg-admin-surface text-admin-muted border-admin-border hover:bg-admin-surface-2'}`}
                >
                    Alquilados
                </button>
                <button
                    role="tab"
                    aria-selected={view === 'vencidos'}
                    onClick={() => cambiarVista('vencidos')}
                    className={`shrink-0 px-4 py-2 rounded-xl text-sm font-bold border transition ${view === 'vencidos' ? 'bg-admin-accent text-admin-bg border-admin-accent' : 'bg-admin-surface text-admin-muted border-admin-border hover:bg-admin-surface-2'}`}
                >
                    Vencidos
                </button>
                <button
                    role="tab"
                    aria-selected={view === 'papelera'}
                    onClick={() => cambiarVista('papelera')}
                    className={`shrink-0 px-4 py-2 rounded-xl text-sm font-bold border transition ${view === 'papelera' ? 'bg-admin-accent text-admin-bg border-admin-accent' : 'bg-admin-surface text-admin-muted border-admin-border hover:bg-admin-surface-2'}`}
                >
                    Papelera
                </button>
            </div>

            {/* Aviso: publicaciones que vencen pronto */}
            {porVencer > 0 && !soloPorVencer && view !== 'papelera' && view !== 'vencidos' && (
                <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-3 bg-transparent border border-admin-warning/30 rounded-2xl p-4">
                    <div className="flex items-start gap-3 flex-1">
                        <FaClock className="text-admin-warning mt-0.5 shrink-0" aria-hidden />
                        <p className="text-sm text-admin-warning">
                            <strong>{porVencer}</strong> {porVencer === 1 ? 'publicación vence' : 'publicaciones vencen'} en los próximos 3 días.
                            {porVencer === 1
                                ? ' Si no la renuevas, dejará de verse en la web.'
                                : ' Si no las renuevas, dejarán de verse en la web.'}
                        </p>
                    </div>
                    <button
                        onClick={() => { verPorVencer(); }}
                        className="shrink-0 bg-admin-surface text-admin-warning border border-admin-warning/40 hover:bg-transparent px-4 py-2 rounded-xl text-sm font-bold"
                    >
                        Ver las que vencen
                    </button>
                </div>
            )}

            {/* Barra de Filtros */}
            <div className="flex flex-wrap justify-between items-center gap-2 mb-2">
                <p className="text-xs font-semibold text-admin-accent bg-admin-accent-soft px-3 py-1 rounded-full w-max">
                    Mostrando resultados {(page * 10) + (inmuebles.length > 0 ? 1 : 0)} - {(page * 10) + inmuebles.length} de {total}
                </p>
                {view === 'activos' && (
                    <button
                        onClick={alternarPorVencer}
                        aria-pressed={soloPorVencer}
                        className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full border transition ${soloPorVencer
                            ? 'bg-admin-warning text-admin-bg border-admin-warning'
                            : 'bg-admin-surface text-admin-warning border-admin-warning/40 hover:bg-transparent'}`}
                    >
                        {soloPorVencer
                            ? <><FaClock aria-hidden /> Quitar filtro: por vencer</>
                            : <><FaClock aria-hidden /> Por vencer (3 días){porVencer > 0 ? `: ${porVencer}` : ''}</>}
                    </button>
                )}
            </div>
            {/* Filtros móvil: búsqueda + panel plegable */}
            <div className="mb-3 rounded-2xl border border-admin-border bg-admin-surface p-3 xl:hidden">
                <div className="flex items-center gap-2">
                    <div className="relative min-w-0 flex-1">
                        <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-admin-muted" aria-hidden />
                        <input
                            id="admin-filtro-titulo-movil"
                            name="filtro-titulo-movil"
                            type="search"
                            placeholder="Buscar propiedades..."
                            aria-label="Filtrar por título"
                            value={searchTerm}
                            onChange={e => { setSearchTerm(e.target.value); setSelectedIds([]); setPage(0); }}
                            className="w-full rounded-xl border border-admin-border bg-admin-surface-2 py-3 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-admin-accent"
                        />
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowMobileFilters(prev => !prev)}
                        aria-expanded={showMobileFilters}
                        aria-controls="admin-filtros-movil"
                        aria-label={showMobileFilters ? 'Ocultar filtros' : 'Mostrar filtros'}
                        className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition ${showMobileFilters ? 'border-admin-accent bg-admin-accent-soft text-admin-accent' : 'border-admin-border bg-admin-surface-2 text-admin-muted hover:text-admin-text'}`}
                    >
                        <FaSlidersH aria-hidden />
                        {filtrosActivos > 0 && (
                            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-admin-primary px-1 text-[10px] font-bold text-white">
                                {filtrosActivos}
                            </span>
                        )}
                    </button>
                </div>

                {showMobileFilters && (
                    <div id="admin-filtros-movil" className="mt-3 space-y-2">
                        <select
                            id="admin-filtro-operacion-movil"
                            aria-label="Filtrar por operación"
                            value={filterOperacion}
                            onChange={(e) => { setFilterOperacion(e.target.value); setSelectedIds([]); setPage(0); }}
                            className="w-full rounded-xl border border-admin-border bg-admin-surface-2 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-admin-accent"
                        >
                            <option value="">Venta y alquiler</option>
                            <option value="Venta">Solo venta</option>
                            <option value="Alquiler">Solo alquiler</option>
                        </select>
                        <select
                            id="admin-filtro-departamento-movil"
                            aria-label="Filtrar por departamento"
                            value={filterDepto}
                            onChange={(e) => {
                                setFilterDepto(e.target.value);
                                setFilterCiudad('');
                                setSelectedIds([]);
                                setPage(0);
                            }}
                            className="w-full rounded-xl border border-admin-border bg-admin-surface-2 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-admin-accent"
                        >
                            <option value="">Todos los Deptos</option>
                            {departamentos.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
                        </select>
                        <select
                            id="admin-filtro-ciudad-movil"
                            aria-label="Filtrar por ciudad"
                            value={filterCiudad}
                            onChange={(e) => { setFilterCiudad(e.target.value); setSelectedIds([]); setPage(0); }}
                            disabled={!filterDepto}
                            className="w-full rounded-xl border border-admin-border bg-admin-surface-2 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-admin-accent disabled:opacity-60"
                        >
                            <option value="">Todas las Ciudades</option>
                            {ciudadesFiltradasAdmin.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                        </select>
                        <div className="flex items-center justify-between pt-1">
                            <button
                                type="button"
                                onClick={() => {
                                    setFilterOperacion('');
                                    setFilterDepto('');
                                    setFilterCiudad('');
                                    setSelectedIds([]);
                                    setPage(0);
                                }}
                                className="text-xs font-bold text-admin-muted hover:text-admin-text"
                            >
                                Limpiar filtros
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowMobileFilters(false)}
                                className="text-xs font-bold text-admin-accent"
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Filtros escritorio */}
            <div className="mb-6 hidden gap-4 rounded-2xl border border-admin-border bg-admin-surface p-4 shadow-sm xl:flex">
                <div className="flex-1 relative">
                    <FaSearch className="absolute left-4 top-3.5 text-admin-muted" aria-hidden />
                    <input
                        id="admin-filtro-titulo"
                        name="filtro-titulo"
                        type="search"
                        placeholder="Filtrar por título (no busca por zona ni características)"
                        aria-label="Filtrar por título"
                        value={searchTerm}
                        onChange={e => { setSearchTerm(e.target.value); setSelectedIds([]); setPage(0); }}
                        className="w-full pl-10 pr-4 py-3 border border-admin-border rounded-xl focus:ring-admin-accent focus:outline-none bg-admin-surface-2"
                    />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 flex-1">
                    <select
                        id="admin-filtro-operacion"
                        name="filtro-operacion"
                        aria-label="Filtrar por operación"
                        value={filterOperacion}
                        onChange={(e) => { setFilterOperacion(e.target.value); setSelectedIds([]); setPage(0); }}
                        className="w-full px-4 py-3 border border-admin-border rounded-xl focus:ring-admin-accent focus:outline-none bg-admin-surface-2 text-sm"
                    >
                        <option value="">Venta y alquiler</option>
                        <option value="Venta">Solo venta</option>
                        <option value="Alquiler">Solo alquiler</option>
                    </select>
                    <select
                        id="admin-filtro-departamento"
                        name="filtro-departamento"
                        aria-label="Filtrar por departamento"
                        value={filterDepto}
                        onChange={(e) => {
                            setFilterDepto(e.target.value);
                            setFilterCiudad('');
                            setSelectedIds([]);
                            setPage(0);
                        }}
                        className="w-full px-4 py-3 border border-admin-border rounded-xl focus:ring-admin-accent focus:outline-none bg-admin-surface-2 text-sm"
                    >
                        <option value="">Todos los Deptos</option>
                        {departamentos.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
                    </select>
                    <select
                        id="admin-filtro-ciudad"
                        name="filtro-ciudad"
                        aria-label="Filtrar por ciudad"
                        value={filterCiudad}
                        onChange={(e) => { setFilterCiudad(e.target.value); setSelectedIds([]); setPage(0); }}
                        disabled={!filterDepto}
                        className="w-full px-4 py-3 border border-admin-border rounded-xl focus:ring-admin-accent focus:outline-none bg-admin-surface-2 text-sm disabled:bg-admin-surface-2"
                    >
                        <option value="">Todas las Ciudades</option>
                        {ciudadesFiltradasAdmin.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                </div>
            </div>

            {selectedIds.length > 0 && (
                <div className="bg-admin-accent-soft border border-admin-accent/30 rounded-2xl p-3 mb-4 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-admin-accent mr-2">
                        {selectedIds.length} seleccionado(s)
                    </span>
                    {view === 'activos' && (
                        <>
                            {puedeRenovar && (
                                <button
                                    onClick={() => handleRenovar(30)}
                                    disabled={bulkLoading}
                                    className="bg-admin-info-soft text-admin-info border border-admin-info/30 hover:bg-admin-info-soft disabled:opacity-50 px-3 py-1.5 rounded-lg text-sm font-bold"
                                >
                                    Renovar 30 días
                                </button>
                            )}
                            {puedeEstado && (
                                <button
                                    onClick={() => handleBulkEstado('Vendido')}
                                    disabled={bulkLoading}
                                    className="bg-transparent text-admin-danger border border-admin-danger/30 hover:bg-transparent disabled:opacity-50 px-3 py-1.5 rounded-lg text-sm font-bold"
                                >
                                    Marcar vendido
                                </button>
                            )}
                            {puedeEstado && (
                                <button
                                    onClick={() => handleBulkEstado('Alquilado')}
                                    disabled={bulkLoading}
                                    className="bg-transparent text-admin-warning border border-admin-warning/30 hover:bg-transparent disabled:opacity-50 px-3 py-1.5 rounded-lg text-sm font-bold"
                                >
                                    Marcar alquilado
                                </button>
                            )}
                            {puedePapelera && (
                            <button
                                onClick={handleBulkMoverAPapelera}
                                disabled={bulkLoading}
                                className="bg-admin-surface text-admin-danger border border-admin-danger/30 hover:bg-transparent disabled:opacity-50 px-3 py-1.5 rounded-lg text-sm font-bold"
                            >
                                Mover a papelera
                            </button>
                            )}
                        </>
                    )}
                    {view === 'vencidos' && (
                        <>
                            {puedeRenovar && (
                            <button
                                onClick={() => handleRenovar(30)}
                                disabled={bulkLoading}
                                className="bg-transparent text-admin-success border border-admin-success/30 hover:bg-transparent disabled:opacity-50 px-3 py-1.5 rounded-lg text-sm font-bold"
                            >
                                Renovar 30 días
                            </button>
                            )}
                            {puedeRenovar && (
                            <button
                                onClick={() => handleRenovar(90)}
                                disabled={bulkLoading}
                                className="bg-transparent text-admin-success border border-admin-success/30 hover:bg-transparent disabled:opacity-50 px-3 py-1.5 rounded-lg text-sm font-bold"
                            >
                                Renovar 90 días
                            </button>
                            )}
                            {puedeRenovar && (
                            <button
                                onClick={() => handleRenovar(null)}
                                disabled={bulkLoading}
                                className="bg-admin-surface text-admin-text border border-admin-border hover:bg-admin-surface-2 disabled:opacity-50 px-3 py-1.5 rounded-lg text-sm font-bold"
                            >
                                Hacer permanente
                            </button>
                            )}
                            {puedePapelera && (
                            <button
                                onClick={handleBulkMoverAPapelera}
                                disabled={bulkLoading}
                                className="bg-admin-surface text-admin-danger border border-admin-danger/30 hover:bg-transparent disabled:opacity-50 px-3 py-1.5 rounded-lg text-sm font-bold"
                            >
                                Mover a papelera
                            </button>
                            )}
                        </>
                    )}
                    {view === 'vendidos' && (
                        <>
                            {puedeEstado && (
                            <button
                                onClick={() => handleBulkEstado('Disponible')}
                                disabled={bulkLoading}
                                className="bg-transparent text-admin-success border border-admin-success/30 hover:bg-transparent disabled:opacity-50 px-3 py-1.5 rounded-lg text-sm font-bold"
                            >
                                Marcar disponible
                            </button>
                            )}
                            {puedePapelera && (
                            <button
                                onClick={handleBulkMoverAPapelera}
                                disabled={bulkLoading}
                                className="bg-admin-surface text-admin-danger border border-admin-danger/30 hover:bg-transparent disabled:opacity-50 px-3 py-1.5 rounded-lg text-sm font-bold"
                            >
                                Mover a papelera
                            </button>
                            )}
                        </>
                    )}
                    {view === 'alquilados' && (
                        <>
                            {puedeEstado && (
                            <button
                                onClick={() => handleBulkEstado('Disponible')}
                                disabled={bulkLoading}
                                className="bg-transparent text-admin-success border border-admin-success/30 hover:bg-transparent disabled:opacity-50 px-3 py-1.5 rounded-lg text-sm font-bold"
                            >
                                Marcar disponible
                            </button>
                            )}
                            {puedePapelera && (
                            <button
                                onClick={handleBulkMoverAPapelera}
                                disabled={bulkLoading}
                                className="bg-admin-surface text-admin-danger border border-admin-danger/30 hover:bg-transparent disabled:opacity-50 px-3 py-1.5 rounded-lg text-sm font-bold"
                            >
                                Mover a papelera
                            </button>
                            )}
                        </>
                    )}
                    {view === 'papelera' && (
                        <>
                            {puedePapelera && (
                            <button
                                onClick={handleBulkRestaurar}
                                disabled={bulkLoading}
                                className="bg-transparent text-admin-success border border-admin-success/30 hover:bg-transparent disabled:opacity-50 px-3 py-1.5 rounded-lg text-sm font-bold"
                            >
                                Restaurar
                            </button>
                            )}
                            {puedeEliminar && (
                            <button
                                onClick={handleBulkEliminarDefinitivamente}
                                disabled={bulkLoading}
                                className="bg-admin-surface text-admin-danger border border-admin-danger/30 hover:bg-transparent disabled:opacity-50 px-3 py-1.5 rounded-lg text-sm font-bold"
                            >
                                Eliminar definitivamente
                            </button>
                            )}
                        </>
                    )}
                    <button
                        onClick={limpiarSeleccion}
                        disabled={bulkLoading}
                        className="text-admin-muted hover:text-admin-text disabled:opacity-50 px-2 py-1.5 text-sm font-bold"
                    >
                        Cancelar
                    </button>
                </div>
            )}

            {loading ? (
                <div className="bg-admin-surface rounded-2xl shadow-sm border overflow-hidden" role="status" aria-label="Cargando inmuebles">
                    <div className="h-12 bg-admin-surface-2 border-b" />
                    {[0, 1, 2, 3, 4].map(fila => (
                        <div key={fila} className="flex items-center gap-4 p-4 border-b last:border-0 animate-pulse">
                            <div className="h-4 w-4 rounded bg-admin-surface-2" />
                            <div className="h-12 w-12 rounded-md bg-admin-surface-2" />
                            <div className="flex-1 space-y-2">
                                <div className="h-4 w-2/3 rounded bg-admin-surface-2" />
                                <div className="h-3 w-1/4 rounded bg-admin-surface-2" />
                            </div>
                            <div className="hidden sm:block h-4 w-20 rounded bg-admin-surface-2" />
                            <div className="hidden md:block h-6 w-24 rounded-full bg-admin-surface-2" />
                        </div>
                    ))}
                    <span className="sr-only">Cargando inmuebles…</span>
                </div>
            ) : error ? (
                <div className="bg-admin-surface rounded-3xl p-16 text-center border" role="alert">
                    <FaExclamationTriangle className="mx-auto text-3xl text-admin-danger mb-3" aria-hidden />
                    <h3 className="text-xl font-bold">No se pudieron cargar los inmuebles</h3>
                    <p className="text-admin-muted mt-2 mb-5">{error}</p>
                    <button
                        onClick={fetchInmuebles}
                        className="bg-admin-primary text-white font-bold px-5 py-2.5 rounded-xl hover:bg-admin-primary-hover transition"
                    >
                        Reintentar
                    </button>
                </div>
            ) : inmuebles.length === 0 ? (
                <div className="bg-admin-surface rounded-3xl p-16 text-center border">
                    <h3 className="text-xl font-bold">
                        {view === 'activos' ? 'Sin propiedades activas'
                            : view === 'vendidos' ? 'Sin inmuebles vendidos'
                                : view === 'alquilados' ? 'Sin alquileres cerrados'
                                    : view === 'vencidos' ? 'No hay publicaciones vencidas'
                                        : 'Papelera vacía'}
                    </h3>
                    <p className="text-admin-muted mb-4">
                        {view === 'activos' && 'No se encontraron resultados para esta búsqueda o página.'}
                        {view === 'vendidos' && 'Los inmuebles marcados como vendidos aparecerán aquí.'}
                        {view === 'alquilados' && 'Los alquileres marcados como alquilados aparecerán aquí.'}
                        {view === 'vencidos' && 'Cuando una publicación pasa su fecha de vencimiento aparece aquí para renovarla.'}
                        {view === 'papelera' && 'Los inmuebles que muevas a la papelera aparecerán aquí.'}
                    </p>
                    {view === 'activos' && onProbarBusqueda && searchTerm.trim().length >= 3 && (
                        <div className="mb-4">
                            <button
                                onClick={() => onProbarBusqueda(searchTerm.trim())}
                                className="flex items-center gap-2 mx-auto text-admin-accent font-bold border border-admin-accent px-4 py-2 rounded-xl hover:bg-admin-accent-soft transition"
                            >
                                <FaSearch aria-hidden />
                                Buscar «{searchTerm.trim()}» por significado
                            </button>
                            <p className="text-xs text-admin-muted mt-2">
                                Este filtro solo mira el título. La búsqueda semántica entiende zonas,
                                características y precios.
                            </p>
                        </div>
                    )}
                    {view === 'activos' && (
                        <button onClick={() => openModal()} className="mt-4 text-admin-accent font-bold border border-admin-accent px-4 py-2 rounded-xl">Crea una propiedad</button>
                    )}
                </div>
            ) : (
                <>
                    <div className="space-y-3 xl:hidden">
                        {inmuebles.map(inv => {
                            const vencimiento = describirVencimiento(inv.expira_at);
                            const portada = getPortada(inv.imagenes);

                            return (
                                <article
                                    key={inv.id}
                                    className={`rounded-2xl border bg-admin-surface p-3 shadow-sm ${selectedIds.includes(inv.id) ? 'border-admin-accent' : 'border-admin-border'}`}
                                >
                                    <div className="flex gap-3">
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.includes(inv.id)}
                                            onChange={() => toggleSelect(inv.id)}
                                            aria-label={`Seleccionar ${inv.titulo}`}
                                            className="mt-1 h-4 w-4 shrink-0 accent-admin-accent"
                                        />
                                        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-admin-surface-2">
                                            {portada && (
                                                <img
                                                    src={getImageUrl(portada.url_storage)}
                                                    className="h-full w-full object-cover"
                                                    alt=""
                                                    loading="lazy"
                                                />
                                            )}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="line-clamp-2 font-bold text-admin-text" title={inv.titulo}>
                                                {inv.titulo}
                                            </p>
                                            <p className="mt-0.5 text-xs text-admin-muted">
                                                {inv.tipo_propiedad} · {inv.operacion}
                                            </p>
                                            <p className="mt-1 text-sm font-bold text-admin-text">
                                                {formatPrecio(inv.precio, inv.moneda)}
                                                {inv.operacion === 'Alquiler' && (
                                                    <span className="text-xs font-semibold text-admin-muted"> /mes</span>
                                                )}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="mt-2 flex flex-wrap items-center gap-2">
                                        {inv.destacado && (
                                            <span className="inline-flex items-center gap-1 rounded-full border border-admin-accent/40 bg-admin-accent-soft px-2 py-0.5 text-[11px] font-bold text-admin-accent">
                                                <FaStar size={9} aria-hidden /> Destacado
                                            </span>
                                        )}
                                        {view !== 'papelera' ? (
                                            <span
                                                title={vencimiento.detalle}
                                                className={`inline-block rounded-full border px-2.5 py-1 text-xs font-bold ${vencimiento.tono === 'vencido'
                                                    ? 'border-admin-danger/30 bg-transparent text-admin-danger'
                                                    : vencimiento.tono === 'aviso'
                                                        ? 'border-admin-warning/30 bg-transparent text-admin-warning'
                                                        : vencimiento.tono === 'ok'
                                                            ? 'border-admin-success/30 bg-transparent text-admin-success'
                                                            : 'border-admin-border bg-admin-surface-2 text-admin-muted'}`}
                                            >
                                                {vencimiento.texto}
                                            </span>
                                        ) : (
                                            <span className="text-xs text-admin-muted">
                                                Eliminado {formatFecha(inv.deleted_at)}
                                            </span>
                                        )}
                                    </div>

                                    <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-admin-border pt-2">
                                        {puedeEstado && view !== 'papelera' && (
                                            <button
                                                onClick={() => handleToggle(inv.id, inv.estado, inv.operacion === 'Alquiler' ? 'Alquiler' : 'Venta')}
                                                className={`rounded-full border px-3 py-1 text-xs font-bold ${inv.estado === 'Vendido'
                                                    ? 'border-admin-danger/30 bg-transparent text-admin-danger'
                                                    : inv.estado === 'Alquilado' || inv.estado === 'Vencido'
                                                        ? 'border-admin-warning/30 bg-transparent text-admin-warning'
                                                        : 'border-admin-success/30 bg-transparent text-admin-success'}`}
                                            >
                                                {inv.estado}
                                            </button>
                                        )}
                                        <span className="ml-auto flex items-center gap-1">
                                            {inv.slug && (
                                                <a
                                                    href={`/inmueble/${inv.slug}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="rounded-lg p-2 text-admin-muted hover:bg-admin-surface-2 hover:text-admin-text"
                                                    title="Vista previa"
                                                    aria-label={`Vista previa de ${inv.titulo}`}
                                                >
                                                    <FaEye aria-hidden />
                                                </a>
                                            )}
                                            {puedeDestacar && view !== 'papelera' && (
                                                <button
                                                    onClick={() => handleDestacar(inv.id, Boolean(inv.destacado))}
                                                    className={`rounded-lg p-2 ${inv.destacado ? 'text-admin-accent hover:bg-admin-accent-soft' : 'text-admin-muted hover:bg-admin-surface-2 hover:text-admin-text'}`}
                                                    title={inv.destacado ? 'Quitar destacado' : 'Marcar como destacado'}
                                                    aria-label={`${inv.destacado ? 'Quitar destacado de' : 'Marcar como destacado'} ${inv.titulo}`}
                                                >
                                                    {inv.destacado ? <FaStar aria-hidden /> : <FaRegStar aria-hidden />}
                                                </button>
                                            )}
                                            {puedeEditar && view !== 'papelera' && (
                                                <button
                                                    onClick={() => openModal(inv)}
                                                    className="rounded-lg p-2 text-admin-info hover:bg-admin-info-soft"
                                                    title="Editar"
                                                    aria-label={`Editar ${inv.titulo}`}
                                                >
                                                    <FaEdit aria-hidden />
                                                </button>
                                            )}
                                            {puedeRenovar && view !== 'papelera' && (inv.estado === 'Vencido' || vencimiento.tono === 'aviso') && (
                                                <button
                                                    onClick={() => handleRenovar(30, [inv.id])}
                                                    className="rounded-lg p-2 text-admin-success hover:bg-transparent"
                                                    title="Renovar 30 días"
                                                    aria-label={`Renovar ${inv.titulo} por 30 días`}
                                                >
                                                    <FaSyncAlt aria-hidden />
                                                </button>
                                            )}
                                            {puedePapelera && view !== 'papelera' && (
                                                <button
                                                    onClick={() => handleMoverAPapelera(inv.id)}
                                                    className="rounded-lg p-2 text-admin-danger hover:bg-transparent"
                                                    title="Mover a la papelera"
                                                    aria-label={`Mover ${inv.titulo} a la papelera`}
                                                >
                                                    <FaTrash aria-hidden />
                                                </button>
                                            )}
                                            {puedePapelera && view === 'papelera' && (
                                                <button
                                                    onClick={() => handleRestaurar(inv.id)}
                                                    className="rounded-lg p-2 text-admin-success hover:bg-transparent"
                                                    title="Restaurar"
                                                    aria-label={`Restaurar ${inv.titulo}`}
                                                >
                                                    <FaUndo aria-hidden />
                                                </button>
                                            )}
                                            {puedeEliminar && view === 'papelera' && (
                                                <button
                                                    onClick={() => handleEliminarDefinitivamente(inv.id)}
                                                    className="rounded-lg p-2 text-admin-danger hover:bg-transparent"
                                                    title="Eliminar definitivamente"
                                                    aria-label={`Eliminar definitivamente ${inv.titulo}`}
                                                >
                                                    <FaTrash aria-hidden />
                                                </button>
                                            )}
                                        </span>
                                    </div>
                                </article>
                            );
                        })}
                    </div>

                    <div className="hidden overflow-x-auto rounded-2xl border border-admin-border bg-admin-surface shadow-sm xl:block">
                        <table className="admin-table w-full min-w-[860px] text-left" aria-label="Inmuebles del catálogo">
                            <caption className="sr-only">
                                Lista de inmuebles con precio, estado, vencimiento y acciones
                            </caption>
                            <thead className="bg-admin-surface-2 border-b">
                                <tr className="text-admin-muted text-sm">
                                    <th scope="col" className="p-4 w-10">
                                        <input
                                            type="checkbox"
                                            checked={allSelected}
                                            onChange={toggleSelectAll}
                                            aria-label="Seleccionar todos los inmuebles de esta página"
                                            className="w-4 h-4 accent-admin-accent cursor-pointer"
                                        />
                                    </th>
                                    <th scope="col" className="p-4 font-semibold w-12 text-center text-admin-muted">Nº</th>
                                    <th scope="col" className="p-4 font-semibold">Inmueble</th>
                                    <th scope="col" className="p-4 font-semibold">Precio</th>
                                    <th scope="col" className="p-4 font-semibold">{view === 'papelera' ? 'Eliminado' : 'Actualizado'}</th>
                                    {view !== 'papelera' && <th scope="col" className="p-4 font-semibold">Vence</th>}
                                    {view !== 'papelera' && <th scope="col" className="p-4 font-semibold text-center">Estado (Toggle)</th>}
                                    <th scope="col" className="p-4 font-semibold text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {inmuebles.map((inv, index) => {
                                    const vencimiento = describirVencimiento(inv.expira_at);
                                    return (
                                    <tr key={inv.id} className={`border-b last:border-0 hover:bg-admin-surface-2 ${selectedIds.includes(inv.id) ? 'bg-admin-accent-soft' : ''}`}>
                                        <td className="p-4">
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.includes(inv.id)}
                                                onChange={() => toggleSelect(inv.id)}
                                                aria-label={`Seleccionar ${inv.titulo}`}
                                                className="w-4 h-4 accent-admin-accent cursor-pointer"
                                            />
                                        </td>
                                        <td className="p-4 text-center font-bold text-admin-muted text-sm">{(page * 10) + index + 1}</td>
                                        <td className="p-4 flex items-center gap-3">
                                            <div className="w-12 h-12 bg-admin-surface-2 rounded-md overflow-hidden min-w-[3rem]">
                                                {getPortada(inv.imagenes) && <img src={getImageUrl(getPortada(inv.imagenes)!.url_storage)} className="w-full h-full object-cover" alt="img" loading="lazy" />}
                                            </div>
                                            <div>
                                                <div className="mr-2 max-w-[220px] font-bold text-admin-text line-clamp-2" title={inv.titulo}>{inv.titulo}</div>
                                                <div className="text-xs text-admin-muted">
                                                    {inv.tipo_propiedad}
                                                    <span className={inv.operacion === 'Alquiler' ? ' text-admin-warning font-bold' : ''}>
                                                        {' · '}{inv.operacion === 'Alquiler' ? 'Alquiler' : 'Venta'}
                                                    </span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-4 font-bold text-admin-text whitespace-nowrap">
                                            {formatPrecio(inv.precio, inv.moneda)}
                                            {inv.operacion === 'Alquiler' && <span className="text-xs font-semibold text-admin-muted"> /mes</span>}
                                        </td>
                                        <td className="p-4 text-sm text-admin-muted whitespace-nowrap" title={new Date(inv.deleted_at ?? inv.updated_at ?? inv.creado_at).toLocaleString('es-BO')}>
                                            {formatFecha(inv.deleted_at ?? inv.updated_at ?? inv.creado_at)}
                                        </td>
                                        {view !== 'papelera' && (
                                            <td className="p-4 whitespace-nowrap">
                                                <span
                                                    title={vencimiento.detalle}
                                                    className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold border ${vencimiento.tono === 'vencido'
                                                        ? 'bg-transparent text-admin-danger border-admin-danger/30'
                                                        : vencimiento.tono === 'aviso'
                                                            ? 'bg-transparent text-admin-warning border-admin-warning/30'
                                                            : vencimiento.tono === 'ok'
                                                                ? 'bg-transparent text-admin-success border-admin-success/30'
                                                                : 'bg-admin-surface-2 text-admin-muted border-admin-border'}`}
                                                >
                                                    {vencimiento.texto}
                                                </span>
                                            </td>
                                        )}
                                        {view !== 'papelera' && (
                                            <td className="p-4 text-center">
                                                {puedeEstado && (
                                                    <button
                                                        onClick={() => handleToggle(inv.id, inv.estado, inv.operacion === 'Alquiler' ? 'Alquiler' : 'Venta')}
                                                        title={inv.estado === 'Disponible'
                                                            ? (inv.operacion === 'Alquiler' ? 'Marcar como alquilado' : 'Marcar como vendido')
                                                            : 'Volver a Disponible'}
                                                        className={`px-3 py-1 rounded-full text-xs font-bold border ${inv.estado === 'Vendido'
                                                            ? 'bg-transparent text-admin-danger border-admin-danger/30 hover:bg-transparent'
                                                            : inv.estado === 'Alquilado'
                                                                ? 'bg-transparent text-admin-warning border-admin-warning/30 hover:bg-transparent'
                                                                : inv.estado === 'Vencido'
                                                                    ? 'bg-transparent text-admin-warning border-admin-warning/30 hover:bg-transparent'
                                                                    : 'bg-transparent text-admin-success border-admin-success/30 hover:bg-transparent'}`}
                                                    >
                                                        {inv.estado}
                                                    </button>
                                                )}
                                            </td>
                                        )}
                                        <td className="p-4 text-right whitespace-nowrap">
                                            {view !== 'papelera' ? (
                                                <>
                                                    {inv.slug && (
                                                        <a
                                                            href={`/inmueble/${inv.slug}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="inline-block text-admin-muted p-2 hover:bg-admin-surface-2 rounded"
                                                            title="Vista previa"
                                                            aria-label={`Vista previa de ${inv.titulo}`}
                                                        >
                                                            <FaEye />
                                                        </a>
                                                    )}
                                                    {puedeDestacar && (
                                                        <button
                                                            onClick={() => handleDestacar(inv.id, Boolean(inv.destacado))}
                                                            className={`p-2 rounded ml-2 ${inv.destacado ? 'text-admin-warning hover:bg-transparent' : 'text-admin-muted hover:bg-admin-surface-2'}`}
                                                            title={inv.destacado ? 'Quitar destacado' : 'Marcar como destacado'}
                                                            aria-label={`${inv.destacado ? 'Quitar destacado de' : 'Marcar como destacado'} ${inv.titulo}`}
                                                        >
                                                            {inv.destacado ? <FaStar /> : <FaRegStar />}
                                                        </button>
                                                    )}
                                                    {puedeEditar && (
                                                        <button onClick={() => openModal(inv)} className="text-admin-info p-2 hover:bg-admin-info-soft rounded ml-2" title="Editar" aria-label={`Editar ${inv.titulo}`}><FaEdit /></button>
                                                    )}
                                                    {puedeRenovar && (inv.estado === 'Vencido' || vencimiento.tono === 'aviso') && (
                                                        <button
                                                            onClick={() => handleRenovar(30, [inv.id])}
                                                            className="text-admin-success p-2 hover:bg-transparent rounded ml-2"
                                                            title="Renovar 30 días"
                                                            aria-label={`Renovar ${inv.titulo} por 30 días`}
                                                        >
                                                            <FaSyncAlt />
                                                        </button>
                                                    )}
                                                    {puedePapelera && (
                                                        <button onClick={() => handleMoverAPapelera(inv.id)} className="text-admin-danger p-2 hover:bg-transparent rounded ml-2" title="Mover a la papelera" aria-label={`Mover ${inv.titulo} a la papelera`}><FaTrash /></button>
                                                    )}
                                                </>
                                            ) : (
                                                <>
                                                    {puedePapelera && (
                                                        <button onClick={() => handleRestaurar(inv.id)} className="text-admin-success p-2 hover:bg-transparent rounded" title="Restaurar" aria-label={`Restaurar ${inv.titulo}`}><FaUndo /></button>
                                                    )}
                                                    {puedeEliminar && (
                                                        <button onClick={() => handleEliminarDefinitivamente(inv.id)} className="text-admin-danger p-2 hover:bg-transparent rounded ml-2" title="Eliminar definitivamente" aria-label={`Eliminar definitivamente ${inv.titulo}`}><FaTrash /></button>
                                                    )}
                                                </>
                                            )}
                                        </td>
                                    </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* PAGINACIÓN */}
                    {totalPages > 1 && (
                        <div className="mt-8 flex justify-center items-center gap-3">
                            <button
                                disabled={page === 0}
                                onClick={() => cambiarPagina(page - 1)}
                                aria-label="Página anterior"
                                className="px-4 py-2 text-sm uppercase font-bold text-admin-muted hover:text-black transition disabled:opacity-30"
                            >
                                Anterior
                            </button>

                            {[...Array(totalPages)].map((_, index) => {
                                if (index < page - 2 || index > page + 2) return null;
                                return (
                                    <button
                                        key={index}
                                        onClick={() => cambiarPagina(index)}
                                        aria-label={`Ir a la página ${index + 1}`}
                                        aria-current={page === index ? 'page' : undefined}
                                        className={`w-10 h-10 rounded-full text-sm font-bold transition-all duration-300
                                            ${page === index
                                                ? 'bg-admin-primary text-white shadow-md'
                                                : 'text-admin-muted hover:bg-admin-surface-2'
                                            }`}
                                    >
                                        {index + 1}
                                    </button>
                                );
                            })}

                            <button
                                disabled={page >= totalPages - 1}
                                onClick={() => cambiarPagina(page + 1)}
                                aria-label="Página siguiente"
                                className="px-4 py-2 text-sm uppercase font-bold text-admin-muted hover:text-black transition disabled:opacity-30"
                            >
                                Siguiente
                            </button>
                        </div>
                    )}
                </>
            )}

            {isModalOpen && (
                <AccessibleModal
                    onClose={() => formCloseRef.current()}
                    labelledBy="inmueble-modal-title"
                    closeOnBackdrop={false}
                    className="bg-admin-surface rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto"
                >
                    <InmuebleForm
                        inmueble={editingInmueble}
                        adminId={adminId}
                        onClose={() => setIsModalOpen(false)}
                        onSuccess={() => {
                            setIsModalOpen(false);
                            fetchInmuebles();
                        }}
                        onRegisterClose={request => { formCloseRef.current = request; }}
                    />
                </AccessibleModal>
            )}

            <ConfirmDialog
                open={confirmacion !== null}
                title={confirmacion?.title ?? ''}
                description={confirmacion?.description ?? ''}
                confirmLabel={confirmacion?.confirmLabel}
                tone={confirmacion?.tone}
                loading={confirmando}
                onCancel={() => setConfirmacion(null)}
                onConfirm={ejecutarConfirmacion}
            />
        </>
    );
};
