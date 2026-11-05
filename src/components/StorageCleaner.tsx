import React, { useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { getStoragePath } from '../utils/helpers';
import toast from 'react-hot-toast';
import { FaTrash, FaSearch, FaSpinner, FaCheckCircle, FaExclamationTriangle } from 'react-icons/fa';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { mensajeError } from '../utils/errors';

export const StorageCleaner: React.FC = () => {
    const [loading, setLoading] = useState(false);
    const [analyzing, setAnalyzing] = useState(false);
    const [orphanedFiles, setOrphanedFiles] = useState<string[]>([]);
    const [analyzed, setAnalyzed] = useState(false);
    const [stats, setStats] = useState({ totalDb: 0, totalStorage: 0 });
    const [confirmOpen, setConfirmOpen] = useState(false);

    // Explorador Recursivo Dinámico que limita al prefijo indicado (ej: 'propiedades')
    const fetchAllStorageFiles = async (bucket: string, prefix: string = '') => {
        const allFiles: string[] = [];
        const { data: list, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000 });
        if (error || !list) return [];

        for (const item of list) {
            if (item.name === '.emptyFolderPlaceholder') continue;

            // Supabase devuelve sin 'id' o mimetype a los que son carpetas
            const isFolder = !item.id || !item.metadata || !item.metadata.mimetype;

            if (isFolder) {
                const subPrefix = prefix ? `${prefix}/${item.name}` : item.name;
                const subFiles = await fetchAllStorageFiles(bucket, subPrefix);
                allFiles.push(...subFiles);
            } else {
                const filePath = prefix ? `${prefix}/${item.name}` : item.name;
                allFiles.push(filePath);
            }
        }
        return allFiles;
    };

    const analyzeStorage = async () => {
        setAnalyzing(true);
        setAnalyzed(false);
        const toastId = toast.loading('Analizando el almacenamiento recursivamente...');
        try {
            // 1. Fetch DB records
            const { data: dbImages, error: dbError } = await supabase.from('imagenes').select('url_storage');
            if (dbError) throw dbError;

            const dbPaths = new Set(
                dbImages
                    .map(img => getStoragePath(img.url_storage as string))
                    .filter(Boolean)
            );

            // 2. Fetch Storage records (Restringido solo a /propiedades para evitar conflictos)
            const storageFiles = await fetchAllStorageFiles('fotos-inmuebles', 'propiedades');

            // 3. Compare
            const orphans = storageFiles.filter(path => !dbPaths.has(path));

            setOrphanedFiles(orphans);
            setStats({ totalDb: dbPaths.size, totalStorage: storageFiles.length });
            setAnalyzed(true);
            toast.success(`Análisis completado: ${orphans.length} archivos huérfanos detectados.`, { id: toastId });
        } catch (error) {
            console.error(error);
            toast.error(mensajeError(error, 'No se pudo analizar el almacenamiento. Reintenta.'), { id: toastId });
        } finally {
            setAnalyzing(false);
        }
    };

    const cleanOrphans = async () => {
        if (orphanedFiles.length === 0) return;

        setLoading(true);
        const toastId = toast.loading(`Eliminando masivamente ${orphanedFiles.length} archivos...`);
        try {
            // Eliminar en lotes de 20 para no sobrecargar el endpoint de Storage (Evita RateLimits)
            const batchSize = 20;
            let totalDeleted = 0;
            for (let i = 0; i < orphanedFiles.length; i += batchSize) {
                const batch = orphanedFiles.slice(i, i + batchSize);
                const { error, data } = await supabase.storage.from('fotos-inmuebles').remove(batch);
                if (error) throw error;
                totalDeleted += data?.length || 0;
            }

            toast.success(`¡Cacería Exitosa! Liberamos el espacio borrando ${totalDeleted} archivos fantasmas.`, { id: toastId });
            setOrphanedFiles([]);
            setStats(prev => ({ ...prev, totalStorage: prev.totalStorage - totalDeleted }));
        } catch (error) {
            console.error(error);
            toast.error(mensajeError(error, 'No se pudieron eliminar los archivos. Reintenta.'), { id: toastId });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-admin-surface p-6 rounded-2xl shadow-sm border border-admin-border mt-2">
            <h3 className="text-xl font-black text-admin-accent mb-2 flex items-center gap-2">
                <FaExclamationTriangle className="text-admin-warning" /> Limpieza del Servidor (Basurero AWS/Supabase)
            </h3>
            <p className="text-admin-muted text-sm mb-6 max-w-2xl">
                Al subir constantes fotos, los archivos pueden quedar "huérfanos" (existen ocupando tu 1GB en Supabase, pero la base de datos ya no los referencia). Con esta herramienta podrás mapear la ruta <strong>/propiedades</strong> y eliminarlos en un clic.
            </p>

            <div className="flex flex-wrap gap-4 mb-6">
                <button
                    onClick={analyzeStorage}
                    disabled={analyzing || loading}
                    className="bg-admin-surface-2 hover:bg-admin-surface text-white font-bold py-3 px-6 rounded-xl flex items-center gap-2 transition disabled:opacity-50"
                >
                    {analyzing ? <FaSpinner className="animate-spin" /> : <FaSearch />}
                    Escanear Archivos Basura
                </button>

                {analyzed && orphanedFiles.length > 0 && (
                    <button
                        onClick={() => setConfirmOpen(true)}
                        disabled={loading}
                        aria-busy={loading}
                        className="bg-admin-danger-strong hover:bg-admin-danger-strong/80 text-white font-bold py-3 px-6 rounded-xl flex items-center gap-2 transition disabled:opacity-50 animate-pulse border-2 border-admin-danger-strong"
                    >
                        {loading ? <FaSpinner className="animate-spin" /> : <FaTrash />}
                        Purgar Basura ({orphanedFiles.length} MB / Archivos)
                    </button>
                )}
            </div>

            {analyzed && (
                <div className="bg-admin-surface-2 rounded-xl p-6 border grid grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="text-center">
                        <span className="block text-4xl font-black text-admin-info">{stats.totalDb}</span>
                        <span className="text-xs font-bold text-admin-muted uppercase tracking-widest mt-1">Fotos en Base de Datos</span>
                    </div>
                    <div className="text-center lg:border-l lg:border-admin-border">
                        <span className="block text-4xl font-black text-admin-text">{stats.totalStorage}</span>
                        <span className="text-xs font-bold text-admin-muted uppercase tracking-widest mt-1">Archivos Físicos</span>
                    </div>
                    <div className="text-center lg:border-l lg:border-admin-border">
                        <span className={`block text-4xl font-black ${orphanedFiles.length > 0 ? 'text-admin-danger' : 'text-admin-success'}`}>
                            {orphanedFiles.length}
                        </span>
                        <span className="text-xs font-bold text-admin-muted uppercase tracking-widest mt-1">Archivos Fantasmas</span>
                    </div>
                    <div className="text-center lg:border-l lg:border-admin-border flex flex-col items-center justify-center">
                        {orphanedFiles.length === 0 ? (
                            <>
                                <FaCheckCircle className="text-4xl text-admin-success mb-1" />
                                <span className="text-xs font-bold text-admin-success uppercase tracking-widest">Sincronizado</span>
                            </>
                        ) : (
                            <>
                                <FaExclamationTriangle className="text-4xl text-admin-warning mb-1 animate-bounce" />
                                <span className="text-xs font-bold text-admin-warning uppercase tracking-widest">Requiere Purgado</span>
                            </>
                        )}
                    </div>
                </div>
            )}

            {analyzed && orphanedFiles.length > 0 && (
                <div className="mt-6">
                    <h4 className="font-bold text-admin-text text-sm mb-2">Vista previa de Elementos a Eliminar:</h4>
                    <div className="max-h-48 overflow-y-auto bg-admin-surface-2 rounded-xl p-4 text-xs font-mono text-admin-muted border whitespace-pre-line break-all">
                        {orphanedFiles.slice(0, 50).join("\n")}
                        {orphanedFiles.length > 50 && `\n\n...y ${orphanedFiles.length - 50} archivos fantasma más.`}
                    </div>
                </div>
            )}

            <ConfirmDialog
                open={confirmOpen}
                title="Purgar archivos huérfanos"
                description={`Se eliminarán permanentemente ${orphanedFiles.length} archivo(s) que ya no usa ningún inmueble. Esta acción no se puede deshacer.`}
                confirmLabel="Eliminar archivos"
                tone="danger"
                loading={loading}
                onCancel={() => setConfirmOpen(false)}
                onConfirm={async () => {
                    await cleanOrphans();
                    setConfirmOpen(false);
                }}
            />
        </div>
    );
};
