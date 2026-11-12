/**
 * AdminLocationsTab Component
 *
 * Pestaña del panel administrativo para gestionar ubicaciones geográficas.
 * Estructura jerárquica: Departamento → Ciudad → Barrio
 *
 * Funcionalidades:
 * - Agregar, renombrar y eliminar departamentos (borrado bloqueado si hay inmuebles)
 * - Agregar, renombrar y eliminar ciudades (borrado bloqueado si hay inmuebles)
 * - Listar barrios por ciudad con su número de inmuebles
 * - Crear, renombrar, eliminar y fusionar barrios
 * - Mensajes claros cuando un nombre ya existe (el índice único de la base lo impide)
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    FaBuilding,
    FaMapMarkerAlt,
    FaPlus,
    FaTrash,
    FaPen,
    FaCheck,
    FaTimes,
    FaSearch,
    FaCodeBranch
} from 'react-icons/fa';
import toast from 'react-hot-toast';
import {
    normalizeLocationName,
    findSimilarLocationName,
    type BarrioConInmuebles,
    type UbicacionCiudad,
    type UbicacionDepartamento
} from '../../hooks/useLocationManager';
import { mensajeError } from '../../utils/errors';
import { ConfirmDialog } from '../ui/ConfirmDialog';

type BarrioRow = BarrioConInmuebles;

type TipoLista = 'departamento' | 'ciudad' | 'barrio';

type Confirmacion = {
    title: string;
    description: string;
    confirmLabel: string;
    tone?: 'danger' | 'warning' | 'primary';
    action: () => void | Promise<void>;
};

interface Props {
    departamentos: UbicacionDepartamento[];
    ciudades: UbicacionCiudad[];
    addDepartamento: (nombre: string) => Promise<UbicacionDepartamento>;
    renameDepartamento: (id: string, nombre: string) => Promise<UbicacionDepartamento>;
    deleteDepartamento: (id: string) => Promise<void>;
    fetchCiudades: () => void;
    fetchDepartamentos: () => void;
    addCiudad: (nombre: string, deptoId: string) => Promise<UbicacionCiudad>;
    renameCiudad: (id: string, nombre: string) => Promise<UbicacionCiudad>;
    deleteCiudad: (id: string) => Promise<void>;
    fetchBarrios: (ciudadId: string) => Promise<BarrioRow[]>;
    addBarrio: (nombre: string, ciudadId: string) => Promise<unknown>;
    renameBarrio: (id: string, nombre: string) => Promise<unknown>;
    deleteBarrio: (id: string) => Promise<void>;
    mergeBarrios: (origen: string, destino: string) => Promise<number>;
    /** Permisos del administrador logueado (ADM-41). */
    permisos?: string[];
    legacy?: boolean;
}

export const AdminLocationsTab: React.FC<Props> = ({
    departamentos, ciudades,
    addDepartamento, renameDepartamento, deleteDepartamento,
    fetchCiudades, fetchDepartamentos, addCiudad, renameCiudad, deleteCiudad,
    fetchBarrios, addBarrio, renameBarrio, deleteBarrio, mergeBarrios
}) => {
    const [newDepto, setNewDepto] = useState('');
    const [newCiudad, setNewCiudad] = useState('');
    const [newBarrio, setNewBarrio] = useState('');
    const [selectedDeptoForCiudad, setSelectedDeptoForCiudad] = useState('');
    const [selectedCiudadForBarrio, setSelectedCiudadForBarrio] = useState('');
    const [busquedaBarrio, setBusquedaBarrio] = useState('');

    const [barrios, setBarrios] = useState<BarrioRow[]>([]);
    const [loadingBarrios, setLoadingBarrios] = useState(false);

    const [editing, setEditing] = useState<{ tipo: TipoLista; id: string } | null>(null);
    const [editValue, setEditValue] = useState('');

    const [fusionOrigen, setFusionOrigen] = useState<BarrioRow | null>(null);
    const [fusionDestino, setFusionDestino] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const [confirmacion, setConfirmacion] = useState<Confirmacion | null>(null);
    const [confirmando, setConfirmando] = useState(false);

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

    const cargarBarrios = useCallback(async (ciudadId: string) => {
        if (!ciudadId) {
            setBarrios([]);
            return;
        }
        setLoadingBarrios(true);
        try {
            const data = await fetchBarrios(ciudadId);
            setBarrios(data);
        } catch (e) {
            toast.error(mensajeError(e, 'No se pudieron cargar los barrios.'));
            setBarrios([]);
        } finally {
            setLoadingBarrios(false);
        }
    }, [fetchBarrios]);

    useEffect(() => {
        cargarBarrios(selectedCiudadForBarrio);
        setFusionOrigen(null);
        setFusionDestino('');
    }, [selectedCiudadForBarrio, cargarBarrios]);

    const ciudadSeleccionada = useMemo(
        () => ciudades.find(c => c.id === selectedCiudadForBarrio) ?? null,
        [ciudades, selectedCiudadForBarrio]
    );

    const barriosFiltrados = useMemo(() => {
        const clave = normalizeLocationName(busquedaBarrio);
        if (!clave) return barrios;
        return barrios.filter(b => normalizeLocationName(b.nombre).includes(clave));
    }, [barrios, busquedaBarrio]);

    const barriosSinUso = useMemo(
        () => barrios.filter(b => b.inmuebles === 0).length,
        [barrios]
    );

    const claveNuevoBarrio = normalizeLocationName(newBarrio);
    const barrioNuevoDuplicado = Boolean(claveNuevoBarrio) && barrios.some(
        b => normalizeLocationName(b.nombre) === claveNuevoBarrio
    );
    const barrioNuevoSimilar = useMemo(
        () => (barrioNuevoDuplicado || !claveNuevoBarrio
            ? null
            : findSimilarLocationName(barrios.map(b => b.nombre), newBarrio)),
        [barrios, barrioNuevoDuplicado, claveNuevoBarrio, newBarrio]
    );

    const empezarEdicion = (tipo: TipoLista, id: string, nombre: string) => {
        setEditing({ tipo, id });
        setEditValue(nombre);
    };

    const cancelarEdicion = () => {
        setEditing(null);
        setEditValue('');
    };

    const guardarEdicion = async () => {
        if (!editing) return;
        const valor = editValue.trim();
        if (!valor) {
            toast.error('El nombre no puede estar vacío.');
            return;
        }

        setIsSaving(true);
        const toastId = toast.loading('Guardando nombre...');
        try {
            if (editing.tipo === 'departamento') {
                await renameDepartamento(editing.id, valor);
                fetchCiudades();
            } else if (editing.tipo === 'ciudad') {
                await renameCiudad(editing.id, valor);
                await cargarBarrios(selectedCiudadForBarrio);
            } else {
                await renameBarrio(editing.id, valor);
                await cargarBarrios(selectedCiudadForBarrio);
            }
            toast.success('Nombre actualizado', { id: toastId });
            cancelarEdicion();
        } catch (e) {
            toast.error(mensajeError(e, 'No se pudo actualizar el nombre.'), { id: toastId });
        } finally {
            setIsSaving(false);
        }
    };

    const handleAddDepto = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newDepto.trim()) return;
        const toastId = toast.loading('Agregando Departamento...');
        try {
            await addDepartamento(newDepto.trim());
            toast.success('Departamento agregado', { id: toastId });
            setNewDepto('');
        } catch (error) {
            toast.error(mensajeError(error, 'No se pudo agregar el departamento.'), { id: toastId });
        }
    };

    const ejecutarEliminarDepto = async (id: string) => {
        const toastId = toast.loading('Verificando y eliminando...');
        try {
            await deleteDepartamento(id);
            toast.success('Departamento eliminado', { id: toastId });
            fetchCiudades();
            fetchDepartamentos();
        } catch (e) {
            toast.error(mensajeError(e, 'No se pudo eliminar el departamento.'), { id: toastId });
        }
    };

    const handleEliminarDepto = (id: string) => {
        pedirConfirmacion({
            title: 'Eliminar departamento',
            description: 'Solo se eliminará si no tiene ciudades ni inmuebles asociados. Si los tiene, el sistema lo bloqueará y te dirá cuántos son.',
            confirmLabel: 'Eliminar departamento',
            action: () => ejecutarEliminarDepto(id),
        });
    };

    const handleAddCiudad = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newCiudad.trim() || !selectedDeptoForCiudad) return;
        const toastId = toast.loading('Agregando Ciudad...');
        try {
            await addCiudad(newCiudad.trim(), selectedDeptoForCiudad);
            toast.success('Ciudad agregada', { id: toastId });
            setNewCiudad('');
        } catch (error) {
            toast.error(mensajeError(error, 'No se pudo agregar la ciudad.'), { id: toastId });
        }
    };

    const ejecutarEliminarCiudad = async (id: string) => {
        const toastId = toast.loading('Verificando y eliminando...');
        try {
            await deleteCiudad(id);
            toast.success('Ciudad eliminada', { id: toastId });
        } catch (e) {
            toast.error(mensajeError(e, 'No se pudo eliminar la ciudad.'), { id: toastId });
        }
    };

    const handleEliminarCiudad = (id: string) => {
        pedirConfirmacion({
            title: 'Eliminar ciudad',
            description: 'Solo se eliminará si no tiene barrios ni inmuebles asociados. Si los tiene, el sistema lo bloqueará y te dirá cuántos son.',
            confirmLabel: 'Eliminar ciudad',
            action: () => ejecutarEliminarCiudad(id),
        });
    };

    const handleAddBarrio = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newBarrio.trim() || !selectedCiudadForBarrio) return;
        const toastId = toast.loading('Agregando Barrio...');
        try {
            await addBarrio(newBarrio.trim(), selectedCiudadForBarrio);
            toast.success('Barrio agregado', { id: toastId });
            setNewBarrio('');
            await cargarBarrios(selectedCiudadForBarrio);
        } catch (error) {
            toast.error(mensajeError(error, 'No se pudo agregar el barrio.'), { id: toastId });
        }
    };

    const ejecutarEliminarBarrio = async (barrio: BarrioRow) => {
        const toastId = toast.loading('Eliminando barrio...');
        try {
            await deleteBarrio(barrio.id);
            toast.success('Barrio eliminado', { id: toastId });
            await cargarBarrios(selectedCiudadForBarrio);
        } catch (e) {
            toast.error(mensajeError(e, 'No se pudo eliminar el barrio.'), { id: toastId });
        }
    };

    const handleEliminarBarrio = (barrio: BarrioRow) => {
        if (barrio.inmuebles > 0) {
            toast.error(`"${barrio.nombre}" tiene ${barrio.inmuebles} inmueble(s). Fusiónalo con otro barrio en vez de eliminarlo.`);
            return;
        }

        pedirConfirmacion({
            title: 'Eliminar barrio',
            description: `¿Eliminar el barrio "${barrio.nombre}"? No tiene inmuebles asociados y esta acción no se puede deshacer.`,
            confirmLabel: 'Eliminar barrio',
            action: () => ejecutarEliminarBarrio(barrio),
        });
    };

    const iniciarFusion = (barrio: BarrioRow) => {
        setFusionOrigen(barrio);
        setFusionDestino('');
    };

    const confirmarFusion = async () => {
        if (!fusionOrigen || !fusionDestino) {
            toast.error('Elige el barrio de destino.');
            return;
        }
        if (fusionDestino === fusionOrigen.id) {
            toast.error('El barrio de origen y el de destino son el mismo.');
            return;
        }

        const destino = barrios.find(b => b.id === fusionDestino);
        setIsSaving(true);
        const toastId = toast.loading('Fusionando barrios...');
        try {
            const movidos = await mergeBarrios(fusionOrigen.id, fusionDestino);
            toast.success(
                movidos > 0
                    ? `Fusión completada: ${movidos} inmueble(s) pasaron a "${destino?.nombre ?? 'el destino'}".`
                    : `Barrios fusionados en "${destino?.nombre ?? 'el destino'}".`,
                { id: toastId }
            );
            setFusionOrigen(null);
            setFusionDestino('');
            await cargarBarrios(selectedCiudadForBarrio);
        } catch (e) {
            toast.error(mensajeError(e, 'No se pudieron fusionar los barrios.'), { id: toastId });
        } finally {
            setIsSaving(false);
        }
    };

    const renderBotonEdicion = (tipo: TipoLista, id: string, nombre: string) => (
        <button
            type="button"
            onClick={() => empezarEdicion(tipo, id, nombre)}
            className="text-admin-muted hover:bg-admin-surface-2 p-2 rounded"
            aria-label={`Renombrar ${nombre}`}
            title="Renombrar"
        >
            <FaPen size={12} />
        </button>
    );

    const renderEditor = (tipo: TipoLista, id: string, nombre: string) => {
        if (editing?.tipo !== tipo || editing.id !== id) {
            return <span className="font-semibold">{nombre}</span>;
        }
        return (
            <div className="flex items-center gap-1 flex-1 min-w-0">
                <input
                    autoFocus
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === 'Enter') { e.preventDefault(); guardarEdicion(); }
                        if (e.key === 'Escape') { e.preventDefault(); cancelarEdicion(); }
                    }}
                    className="border p-1.5 rounded flex-1 min-w-0 text-sm focus:ring-admin-accent focus:outline-none"
                    aria-label="Nuevo nombre"
                />
                <button
                    type="button"
                    onClick={guardarEdicion}
                    disabled={isSaving}
                    className="text-admin-success hover:bg-admin-success-soft p-2 rounded disabled:opacity-50"
                    aria-label="Guardar nombre"
                >
                    <FaCheck size={12} />
                </button>
                <button
                    type="button"
                    onClick={cancelarEdicion}
                    className="text-admin-muted hover:bg-admin-surface-2 p-2 rounded"
                    aria-label="Cancelar edición"
                >
                    <FaTimes size={12} />
                </button>
            </div>
        );
    };

    return (
        <>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Departamentos */}
            <div className="bg-admin-surface p-6 rounded-2xl shadow-sm border">
                <h3 className="font-serif text-xl font-bold text-admin-accent mb-4 flex items-center gap-2"><FaBuilding /> Departamentos</h3>
                <form onSubmit={handleAddDepto} className="flex gap-2 mb-6">
                    <input required value={newDepto} onChange={e => setNewDepto(e.target.value)} placeholder="Ej. Tarija" className="border p-2 rounded flex-1 min-w-0 focus:ring-admin-accent focus:outline-none" />
                    <button type="submit" className="bg-admin-primary text-white px-4 rounded font-bold whitespace-nowrap" aria-label="Agregar departamento"><FaPlus /></button>
                </form>
                <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                    {departamentos.map(d => (
                        <div key={d.id} className="flex justify-between items-center bg-admin-surface-2 p-3 rounded border gap-2">
                            {renderEditor('departamento', d.id, d.nombre)}
                            <div className="flex items-center gap-1 shrink-0">
                                {renderBotonEdicion('departamento', d.id, d.nombre)}
                                <button onClick={() => handleEliminarDepto(d.id)} className="text-admin-danger hover:bg-admin-danger-soft p-2 rounded" aria-label={`Eliminar ${d.nombre}`}><FaTrash size={12} /></button>
                            </div>
                        </div>
                    ))}
                    {departamentos.length === 0 && <p className="text-sm text-admin-muted">No hay departamentos definidos.</p>}
                </div>
            </div>

            {/* Ciudades */}
            <div className="bg-admin-surface p-6 rounded-2xl shadow-sm border">
                <h3 className="font-serif text-xl font-bold text-admin-accent mb-4 flex items-center gap-2"><FaMapMarkerAlt /> Ciudades</h3>
                <form onSubmit={handleAddCiudad} className="flex flex-col gap-2 mb-6">
                    <select required value={selectedDeptoForCiudad} onChange={e => setSelectedDeptoForCiudad(e.target.value)} className="border p-2 rounded focus:ring-admin-accent focus:outline-none text-sm">
                        <option value="">Seleccione Departamento...</option>
                        {departamentos.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
                    </select>
                    <div className="flex gap-2">
                        <input required value={newCiudad} onChange={e => setNewCiudad(e.target.value)} placeholder="Ej. Cercado, Bermejo..." className="border p-2 rounded flex-1 min-w-0 focus:ring-admin-accent focus:outline-none" />
                        <button type="submit" className="bg-admin-primary text-white px-4 rounded font-bold" aria-label="Agregar ciudad"><FaPlus /></button>
                    </div>
                </form>
                <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                    {ciudades
                        .filter(c => selectedDeptoForCiudad ? c.departamento_id === selectedDeptoForCiudad : true)
                        .map(c => (
                            <div key={c.id} className="flex justify-between items-center bg-admin-surface-2 p-3 rounded border gap-2">
                                <div className="flex-1 min-w-0">
                                    {editing?.tipo === 'ciudad' && editing.id === c.id ? (
                                        renderEditor('ciudad', c.id, c.nombre)
                                    ) : (
                                        <>
                                            <span className="font-semibold block truncate">{c.nombre}</span>
                                            <span className="text-xs text-admin-muted">Depto: {c.departamentos?.nombre}</span>
                                        </>
                                    )}
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                    {renderBotonEdicion('ciudad', c.id, c.nombre)}
                                    <button onClick={() => handleEliminarCiudad(c.id)} className="text-admin-danger hover:bg-admin-danger-soft p-2 rounded" aria-label={`Eliminar ${c.nombre}`}><FaTrash size={12} /></button>
                                </div>
                            </div>
                        ))}
                    {ciudades.filter(c => selectedDeptoForCiudad ? c.departamento_id === selectedDeptoForCiudad : true).length === 0 && <p className="text-sm text-admin-muted">Aún no hay ciudades asociadas en esta vista.</p>}
                </div>
            </div>

            {/* Barrios */}
            <div className="bg-admin-surface p-6 rounded-2xl shadow-sm border md:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <h3 className="font-serif text-xl font-bold text-admin-accent flex items-center gap-2"><FaCodeBranch /> Barrios</h3>
                    {ciudadSeleccionada && (
                        <span className="text-sm text-admin-muted">
                            {barrios.length} barrio(s) en {ciudadSeleccionada.nombre}
                            {barriosSinUso > 0 && (
                                <> · <span className="text-admin-warning">{barriosSinUso} sin uso</span></>
                            )}
                        </span>
                    )}
                </div>

                <p className="text-sm text-admin-muted mb-4">
                    Los barrios se crean desde el formulario de un inmueble o aquí. Si dos barrios deberían ser uno,
                    fusiónalos: los inmuebles pasan al destino y el sobrante desaparece.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <div>
                        <label htmlFor="barrio-ciudad" className="block text-xs font-bold uppercase tracking-wide text-admin-muted mb-1">Ciudad</label>
                        <select
                            id="barrio-ciudad"
                            value={selectedCiudadForBarrio}
                            onChange={e => setSelectedCiudadForBarrio(e.target.value)}
                            className="border p-2 rounded w-full focus:ring-admin-accent focus:outline-none text-sm"
                        >
                            <option value="">Seleccione Ciudad...</option>
                            {ciudades.map(c => (
                                <option key={c.id} value={c.id}>
                                    {c.nombre}{c.departamentos?.nombre ? ` · ${c.departamentos.nombre}` : ''}
                                </option>
                            ))}
                        </select>
                    </div>
                    <form onSubmit={handleAddBarrio} className="flex flex-col">
                        <label htmlFor="barrio-nombre" className="block text-xs font-bold uppercase tracking-wide text-admin-muted mb-1">Nuevo barrio</label>
                        <div className="flex gap-2">
                            <input
                                id="barrio-nombre"
                                value={newBarrio}
                                onChange={e => setNewBarrio(e.target.value)}
                                disabled={!selectedCiudadForBarrio}
                                placeholder={selectedCiudadForBarrio ? 'Ej. San Blas' : 'Elige una ciudad primero'}
                                className="border p-2 rounded flex-1 min-w-0 focus:ring-admin-accent focus:outline-none text-sm disabled:bg-admin-surface-2"
                            />
                            <button
                                type="submit"
                                disabled={!selectedCiudadForBarrio || !newBarrio.trim() || barrioNuevoDuplicado}
                                className="bg-admin-primary text-white px-4 rounded font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                                aria-label="Agregar barrio"
                            >
                                <FaPlus />
                            </button>
                        </div>
                        {barrioNuevoDuplicado ? (
                            <p className="mt-1 text-xs text-admin-danger">
                                Ya existe un barrio con ese nombre en esta ciudad.
                            </p>
                        ) : barrioNuevoSimilar ? (
                            <p className="mt-1 text-xs text-admin-warning">
                                Se parece a «{barrioNuevoSimilar}». Revísalo antes de crear un duplicado.
                            </p>
                        ) : null}
                    </form>
                </div>

                {selectedCiudadForBarrio && (
                    <>
                        <div className="relative mb-3">
                            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-admin-muted text-sm" />
                            <input
                                value={busquedaBarrio}
                                onChange={e => setBusquedaBarrio(e.target.value)}
                                placeholder="Buscar barrio..."
                                className="border p-2 pl-9 rounded w-full focus:ring-admin-accent focus:outline-none text-sm"
                                aria-label="Buscar barrio"
                            />
                        </div>

                        <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
                            {loadingBarrios && (
                                <div role="status" aria-label="Cargando barrios" className="space-y-2">
                                    {[0, 1, 2].map(fila => (
                                        <div key={fila} className="flex items-center justify-between gap-3 rounded border p-3 animate-pulse">
                                            <div className="h-4 w-1/2 rounded bg-admin-surface-2" />
                                            <div className="h-6 w-20 rounded-full bg-admin-surface-2" />
                                        </div>
                                    ))}
                                    <span className="sr-only">Cargando barrios…</span>
                                </div>
                            )}
                            {!loadingBarrios && barriosFiltrados.map(b => (
                                <div key={b.id} className="bg-admin-surface-2 p-3 rounded border">
                                    <div className="flex flex-wrap justify-between items-center gap-2">
                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                            {renderEditor('barrio', b.id, b.nombre)}
                                            <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${b.inmuebles > 0 ? 'bg-admin-accent-soft text-admin-accent' : 'bg-admin-surface-2 text-admin-muted'}`}>
                                                {b.inmuebles > 0 ? `${b.inmuebles} inmueble${b.inmuebles === 1 ? '' : 's'}` : 'Sin uso'}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                            {renderBotonEdicion('barrio', b.id, b.nombre)}
                                            <button
                                                type="button"
                                                onClick={() => iniciarFusion(b)}
                                                className="text-admin-muted hover:bg-admin-surface-2 p-2 rounded"
                                                aria-label={`Fusionar ${b.nombre} con otro barrio`}
                                                title="Fusionar con otro barrio"
                                            >
                                                <FaCodeBranch size={12} />
                                            </button>
                                            <button
                                                onClick={() => handleEliminarBarrio(b)}
                                                className="text-admin-danger hover:bg-admin-danger-soft p-2 rounded"
                                                aria-label={`Eliminar ${b.nombre}`}
                                                title={b.inmuebles > 0 ? 'Tiene inmuebles: fusiónalo' : 'Eliminar'}
                                            >
                                                <FaTrash size={12} />
                                            </button>
                                        </div>
                                    </div>

                                    {fusionOrigen?.id === b.id && (
                                        <div className="mt-3 p-3 rounded-lg border border-admin-warning/40 bg-admin-warning-soft">
                                            <p className="text-xs text-admin-warning mb-2">
                                                Fusionar <strong>{b.nombre}</strong> con otro barrio de {ciudadSeleccionada?.nombre}.
                                                {b.inmuebles > 0
                                                    ? ` Los ${b.inmuebles} inmueble(s) pasarán al destino.`
                                                    : ' No tiene inmuebles: solo desaparecerá el barrio.'}
                                                {' '}&quot;{b.nombre}&quot; dejará de existir.
                                            </p>
                                            <div className="flex flex-col sm:flex-row gap-2">
                                                <select
                                                    value={fusionDestino}
                                                    onChange={e => setFusionDestino(e.target.value)}
                                                    className="border p-2 rounded flex-1 min-w-0 text-sm"
                                                    aria-label="Barrio de destino"
                                                >
                                                    <option value="">Barrio de destino...</option>
                                                    {barrios.filter(x => x.id !== b.id).map(x => (
                                                        <option key={x.id} value={x.id}>{x.nombre} ({x.inmuebles})</option>
                                                    ))}
                                                </select>
                                                <div className="flex gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={confirmarFusion}
                                                        disabled={isSaving || !fusionDestino}
                                                        className="bg-admin-warning text-admin-bg hover:bg-admin-warning/80 px-3 py-2 rounded font-bold text-sm disabled:opacity-50"
                                                    >
                                                        {isSaving ? 'Fusionando...' : 'Fusionar'}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => { setFusionOrigen(null); setFusionDestino(''); }}
                                                        className="bg-admin-surface border px-3 py-2 rounded font-bold text-sm"
                                                    >
                                                        Cancelar
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                            {!loadingBarrios && barriosFiltrados.length === 0 && (
                                <p className="text-sm text-admin-muted">
                                    {barrios.length === 0
                                        ? 'Esta ciudad todavía no tiene barrios. Crea el primero arriba.'
                                        : `Ningún barrio coincide con "${busquedaBarrio}".`}
                                </p>
                            )}
                        </div>
                    </>
                )}
                {!selectedCiudadForBarrio && (
                    <p className="text-sm text-admin-muted">Elige una ciudad para ver y gestionar sus barrios.</p>
                )}
            </div>
        </div>

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
