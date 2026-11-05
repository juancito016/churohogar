/**
 * InmuebleForm Component
 * 
 * Formulario modal completo para crear o editar inmuebles.
 * Características:
 * - Crear nuevos inmuebles
 * - Editar inmuebles existentes
 * - Gestión de ubicación (departamento → ciudad → barrio)
 * - Carga y compresión de imágenes
 * - Manejo de imágenes existentes
 * - Validaciones de formulario
 * - Integración con Supabase
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '../services/supabaseClient';
import imageCompression from 'browser-image-compression';
import { FaTimes, FaCamera, FaSpinner, FaArrowLeft, FaArrowRight, FaStar, FaTrash } from 'react-icons/fa';
import { useLocationManager } from '../hooks/useLocationManager';
import { useBusinessConfig } from '../hooks/useBusinessConfig';
import { AccessibleModal } from './ui/AccessibleModal';
import { getImageUrl, getStoragePath } from '../utils/helpers';
import { syncInmuebleEmbeddings } from '../utils/syncEmbedding';
import {
    DURACIONES,
    describirVencimiento,
    expiracionDesdeOpcion,
    type DuracionPublicacion,
} from '../utils/publication';

const DESCRIPCION_MIN = 80;
const DESCRIPCION_MAX = 300;

type NewPhoto = {
    key: string;
    file: File;
    preview: string;
};

type PhotoRef =
    | { kind: 'existing'; id: string }
    | { kind: 'new'; key: string };

const sortImagesByOrder = (images: any[]) =>
    [...images].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));

const createNewPhoto = (file: File): NewPhoto => ({
    key: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
    file,
    preview: URL.createObjectURL(file),
});

const buildSlugBase = (titulo: string) =>
    titulo
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '');

const buildSlugCandidate = (base: string) =>
    `${base || 'inmueble'}-${Math.random().toString(36).slice(2, 8)}`;

const buildInitialFormData = (inmueble?: FormProps['inmueble']) => {
    // La moneda va pegada a la operación: venta en USD y alquiler en Bs.
    const operacion: 'Venta' | 'Alquiler' = inmueble?.operacion === 'Alquiler' ? 'Alquiler' : 'Venta';
    return {
        titulo: inmueble?.titulo || '',
        descripcion: inmueble?.descripcion || '',
        tipo_propiedad: inmueble?.tipo_propiedad || 'Casa',
        operacion,
        precio: inmueble?.precio || '',
        moneda: operacion === 'Alquiler' ? 'Bs' : 'USD',
        superficie_terreno: inmueble?.superficie_terreno || '',
        superficie_construida: inmueble?.superficie_construida || '',
        habitaciones: inmueble?.habitaciones || 0,
        banos: inmueble?.banos || 0,
        servicios: (inmueble?.servicios as string[]) || [],
        estado: inmueble?.estado || 'Disponible',
        destacado: inmueble?.destacado ?? false,
        contacto: inmueble?.contacto ? inmueble.contacto.replace('+591', '') : '',
        map_url: inmueble?.map_url || ''
    };
};

const buildInitialUbicacion = (inmueble?: FormProps['inmueble']) => ({
    departamento_id: inmueble?.barrios?.ciudades?.departamento_id || '',
    ciudad_id: inmueble?.barrios?.ciudad_id || '',
    barrio_nombre: inmueble?.barrios?.nombre || ''
});

const sameStringSet = (a: string[], b: string[]) => {
    if (a.length !== b.length) return false;
    const sortedA = [...a].sort();
    const sortedB = [...b].sort();
    return sortedA.every((value, index) => value === sortedB[index]);
};

const isSlugConflict = (error: { code?: string; message?: string } | null) =>
    error?.code === '23505' && (error.message || '').toLowerCase().includes('slug');

const parseOptionalNumber = (value: string | number | null | undefined) =>
    value === '' || value === null || value === undefined ? null : Number(value);

/**
 * Props para el componente InmuebleForm
 * 
 * @interface FormProps
 * @property {any} [inmueble] - Inmueble a editar (si está vacío, es modo creación)
 *           Debe incluir: id, titulo, descripcion, tipo_propiedad, precio, etc.
 *           Y relaciones: imagenes[], barrios { ciudades { departamentos } }
 * 
 * @property {string} adminId - ID del administrador/usuario autenticado
 *           Necesario para asociar el inmueble con el admin propietario
 * 
 * @property {() => void} onClose - Callback para cerrar el modal del formulario
 *           Se ejecuta cuando el usuario hace clic en cerrar o después de enviar
 * 
 * @property {() => void} onSuccess - Callback ejecutado después de crear/editar exitosamente
 *           Típicamente se usa para recargar la lista de inmuebles
 * 
 * @description
 * El formulario automáticamente detecta si está en modo:
 * - CREACIÓN: si inmueble es undefined/null
 * - EDICIÓN: si inmueble tiene datos
 * 
 * @example
 * <InmuebleForm
 *   inmueble={undefined}
 *   adminId="admin-123"
 *   onClose={() => setIsOpen(false)}
 *   onSuccess={() => refreshList()}
 * />
 */
interface FormProps {
    inmueble?: any;
    adminId: string;
    onClose: () => void;
    onSuccess: () => void;
    /** Permite al contenedor (el modal) usar el cierre con aviso de cambios. */
    onRegisterClose?: (requestClose: () => void) => void;
}

export const InmuebleForm: React.FC<FormProps> = ({ inmueble, adminId, onClose, onSuccess, onRegisterClose }) => {
    const isEditing = !!inmueble;
    const [submitting, setSubmitting] = useState(false);
    const [newPhotos, setNewPhotos] = useState<NewPhoto[]>([]);
    const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
    const newPhotosRef = useRef<NewPhoto[]>([]);

    // Duración elegida al publicar. Al editar no se toca: la renovación se hace
    // desde el panel para no republicar sin querer.
    const [duracion, setDuracion] = useState<DuracionPublicacion>('30');
    const [diasPersonalizados, setDiasPersonalizados] = useState('45');

    const { getOrCreateBarrio, departamentos, ciudades, fetchDepartamentos, fetchCiudades } = useLocationManager();
    const { config } = useBusinessConfig();
    const whatsappSugerido = config.whatsapp.startsWith('591')
        ? config.whatsapp.slice(3)
        : config.whatsapp;

    // Precargar locations referenciales (idealmente filtramos ciudades por depto, aquí simplificado)
    useEffect(() => {
        fetchDepartamentos();
        fetchCiudades();
    }, [fetchDepartamentos, fetchCiudades]);

    const [existingImages, setExistingImages] = useState<any[]>(() => sortImagesByOrder(inmueble?.imagenes || []));
    const [markedForDeletion, setMarkedForDeletion] = useState<string[]>([]);
    const [photoOrder, setPhotoOrder] = useState<PhotoRef[]>(() =>
        sortImagesByOrder(inmueble?.imagenes || []).map(img => ({ kind: 'existing', id: img.id }))
    );

    useEffect(() => {
        const images = sortImagesByOrder(inmueble?.imagenes || []);
        setExistingImages(images);
        setMarkedForDeletion([]);
        setPhotoOrder(images.map(img => ({ kind: 'existing', id: img.id })));
        setNewPhotos(prev => {
            prev.forEach(photo => URL.revokeObjectURL(photo.preview));
            return [];
        });
    }, [inmueble]);

    useEffect(() => {
        newPhotosRef.current = newPhotos;
    }, [newPhotos]);

    useEffect(() => () => {
        newPhotosRef.current.forEach(photo => URL.revokeObjectURL(photo.preview));
    }, []);

    const initialFormData = useMemo(() => buildInitialFormData(inmueble), [inmueble]);
    const initialUbicacion = useMemo(() => buildInitialUbicacion(inmueble), [inmueble]);
    const initialPhotoIds = useMemo(
        () => sortImagesByOrder(inmueble?.imagenes || []).map(image => image.id as string),
        [inmueble]
    );

    const [formUbicacion, setFormUbicacion] = useState(() => buildInitialUbicacion(inmueble));
    const [formData, setFormData] = useState(() => buildInitialFormData(inmueble));

    const hasChanges = useMemo(() => {
        const formChanged = (Object.keys(initialFormData) as (keyof typeof initialFormData)[]).some(key => {
            if (key === 'servicios') return !sameStringSet(formData.servicios, initialFormData.servicios);
            return String(formData[key] ?? '') !== String(initialFormData[key] ?? '');
        });

        const locationChanged = (Object.keys(initialUbicacion) as (keyof typeof initialUbicacion)[]).some(
            key => formUbicacion[key] !== initialUbicacion[key]
        );

        const currentExistingIds = photoOrder.flatMap(ref => ref.kind === 'existing' ? [ref.id] : []);
        const photosChanged =
            markedForDeletion.length > 0 ||
            newPhotos.length > 0 ||
            currentExistingIds.length !== initialPhotoIds.length ||
            currentExistingIds.some((id, index) => id !== initialPhotoIds[index]);

        return formChanged || locationChanged || photosChanged;
    }, [formData, formUbicacion, markedForDeletion, newPhotos.length, photoOrder, initialFormData, initialUbicacion, initialPhotoIds]);

    useEffect(() => {
        if (!hasChanges || submitting) return;

        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = '';
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [hasChanges, submitting]);

    useEffect(() => {
        if (!showDiscardConfirm) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setShowDiscardConfirm(false);
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [showDiscardConfirm]);

    const SERVICIOS_DISPONIBLES = [
        'Agua', 'Electricidad', 'Gas domiciliario', 'Alcantarillado', 'Internet',
        'Pavimento', 'Muro perimetral', 'Piscina', 'Jardín', 'Garaje', 'Amoblado'
    ];

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        if (name === 'operacion') {
            // Cambia la moneda: el precio anterior ya no significa lo mismo.
            const operacion = value === 'Alquiler' ? 'Alquiler' : 'Venta';
            setFormData(prev => ({
                ...prev,
                operacion,
                moneda: operacion === 'Alquiler' ? 'Bs' : 'USD',
                precio: prev.operacion === operacion ? prev.precio : '',
            }));
            if (formData.operacion !== operacion && formData.precio !== '') {
                toast('Cambiaste la operación: vuelve a ingresar el precio en la moneda nueva.');
            }
            return;
        }
        if (name === 'tipo_propiedad' && value === 'Lote') {
            setFormData(prev => ({ ...prev, tipo_propiedad: value, superficie_construida: '', habitaciones: 0, banos: 0 }));
            return;
        }
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const esAlquiler = formData.operacion === 'Alquiler';

    const esLote = formData.tipo_propiedad === 'Lote';

    const toggleServicio = (servicio: string) => {
        setFormData(prev => ({
            ...prev,
            servicios: prev.servicios.includes(servicio)
                ? prev.servicios.filter((s: string) => s !== servicio)
                : [...prev.servicios, servicio]
        }));
    };

    const handleUbiChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormUbicacion(prev => {
            const up = { ...prev, [name]: value };
            if (name === 'departamento_id') {
                up.ciudad_id = '';
            }
            return up;
        });
    };

    const ciudadesFiltradas = formUbicacion.departamento_id
        ? ciudades.filter(c => c.departamento_id === formUbicacion.departamento_id)
        : [];

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const files = Array.from(e.target.files);
            if (files.length + newPhotos.length + existingImages.length - markedForDeletion.length > 15) {
                toast.error('Solo se permiten hasta 15 imágenes por inmueble.');
                return;
            }
            const added = files.map(createNewPhoto);
                setNewPhotos(prev => [...prev, ...added]);
            setPhotoOrder(prev => [...prev, ...added.map(photo => ({ kind: 'new' as const, key: photo.key }))]);
        }
    };

    const removeNewPhoto = (key: string) => {
        const photo = newPhotos.find(item => item.key === key);
        if (photo) URL.revokeObjectURL(photo.preview);
        setNewPhotos(prev => prev.filter(item => item.key !== key));
        setPhotoOrder(prev => prev.filter(ref => !(ref.kind === 'new' && ref.key === key)));
    };

    const movePhoto = (index: number, direction: -1 | 1) => {
        setPhotoOrder(prev => {
            const target = index + direction;
            if (target < 0 || target >= prev.length) return prev;
            const next = [...prev];
            [next[index], next[target]] = [next[target], next[index]];
            return next;
        });
    };

    const setCover = (index: number) => {
        if (index === 0) return;
        setPhotoOrder(prev => {
            const next = [...prev];
            const [item] = next.splice(index, 1);
            next.unshift(item);
            return next;
        });
    };

    const toggleExistingPhotoDeletion = (imageId: string) => {
        setMarkedForDeletion(prev =>
            prev.includes(imageId) ? prev.filter(id => id !== imageId) : [...prev, imageId]
        );
    };

    // Compresión y subida conectada a fotos-inmuebles
    const uploadAndOptimizeImages = async (inmuebleId: string): Promise<Map<string, string>> => {
        const urls = new Map<string, string>();
        const options = {
            maxSizeMB: 0.8, // 800 KB max
            maxWidthOrHeight: 1200,
            useWebWorker: true,
            fileType: 'image/webp',
        };

        for (let i = 0; i < newPhotos.length; i++) {
            const photo = newPhotos[i];
            const file = photo.file;
            try {
                const compressedBlob = await imageCompression(file, options);
                // Convertir File a webp explicitamente
                const optimizedFile = new File([compressedBlob], `img_${Date.now()}_${i}.webp`, { type: 'image/webp' });

                const filePath = `propiedades/${inmuebleId}/${optimizedFile.name}`;

                const { data, error } = await supabase.storage
                    .from('fotos-inmuebles')
                    .upload(filePath, optimizedFile, { cacheControl: '3600', upsert: false });

                if (error) throw error;

                if (data) {
                    urls.set(photo.key, data.path);
                }
            } catch (err) {
                console.error('Error optimizando imagen:', err);
                toast.error(`La imagen ${file.name} no se procesó.`);
            }
        }
        return urls;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Validaciones de ubicacion
        if (!formUbicacion.ciudad_id) {
            toast.error('Debes seleccionar una ciudad.');
            return;
        }
        if (!formUbicacion.barrio_nombre.trim()) {
            toast.error('Debes escribir el nombre del barrio.');
            return;
        }

        const titulo = formData.titulo.trim();
        const descripcion = formData.descripcion.trim();
        const precio = Number(formData.precio);
        const superficieTerreno = parseOptionalNumber(formData.superficie_terreno);
        const superficieConstruida = parseOptionalNumber(formData.superficie_construida);
        const habitaciones = Number(formData.habitaciones);
        const banos = Number(formData.banos);

        if (!titulo) {
            toast.error('El título es obligatorio.');
            return;
        }
        if (descripcion.length < DESCRIPCION_MIN || descripcion.length > DESCRIPCION_MAX) {
            toast.error(`La descripción debe tener entre ${DESCRIPCION_MIN} y ${DESCRIPCION_MAX} caracteres (actual: ${descripcion.length}).`);
            return;
        }
        if (!Number.isFinite(precio) || precio <= 0) {
            toast.error('El precio debe ser mayor que 0.');
            return;
        }
        if (superficieTerreno !== null && (!Number.isFinite(superficieTerreno) || superficieTerreno < 0)) {
            toast.error('La superficie del terreno no puede ser negativa.');
            return;
        }
        if (superficieConstruida !== null && (!Number.isFinite(superficieConstruida) || superficieConstruida < 0)) {
            toast.error('La superficie construida no puede ser negativa.');
            return;
        }
        if (!Number.isInteger(habitaciones) || habitaciones < 0) {
            toast.error('Las habitaciones deben ser un número entero mayor o igual a 0.');
            return;
        }
        if (!Number.isInteger(banos) || banos < 0) {
            toast.error('Los baños deben ser un número entero mayor o igual a 0.');
            return;
        }

        if (!isEditing && duracion === 'personalizado') {
            const dias = Number(diasPersonalizados);
            if (!Number.isInteger(dias) || dias < 1 || dias > 3650) {
                toast.error('La duración personalizada debe ser un número entero entre 1 y 3650 días.');
                return;
            }
        }

        setSubmitting(true);
        const toastId = toast.loading(isEditing ? 'Guardando cambios...' : 'Publicando inmueble...');

        try {
            // Lógica crítica: Obtener o crear el UUID del Barrio
            const finalBarrioId = await getOrCreateBarrio(formUbicacion.barrio_nombre, formUbicacion.ciudad_id);

            const baseSlug = buildSlugBase(titulo);
            let slug = inmueble?.slug || buildSlugCandidate(baseSlug);

            const payload = {
                titulo,
                descripcion,
                tipo_propiedad: formData.tipo_propiedad,
                operacion: formData.operacion,
                precio,
                moneda: formData.operacion === 'Alquiler' ? 'Bs' : 'USD',
                superficie_terreno: superficieTerreno,
                superficie_construida: superficieConstruida,
                habitaciones,
                banos,
                servicios: formData.servicios,
                estado: formData.estado,
                destacado: Boolean(formData.destacado),
                barrio_id: finalBarrioId,
                admin_id: adminId,
                contacto: formData.contacto.trim() || null,
                map_url: formData.map_url.trim() || null,
                // Al crear, la publicación nace hoy con la duración elegida.
                // Al editar no se tocan las fechas: para eso está "Renovar".
                ...(isEditing ? {} : {
                    publicado_at: new Date().toISOString(),
                    expira_at: expiracionDesdeOpcion(duracion, Number(diasPersonalizados)),
                }),
            };

            let newInmuebleId: string | undefined = inmueble?.id;

            if (isEditing) {
                if (!newInmuebleId) throw new Error('No se encontró el inmueble a editar.');
                const { error } = await supabase.from('inmuebles').update({ ...payload, slug }).eq('id', newInmuebleId);
                if (error) throw error;
            } else {
                for (let attempt = 0; attempt < 4; attempt++) {
                    const candidateSlug = attempt === 0 ? slug : buildSlugCandidate(baseSlug);
                    const { data, error } = await supabase
                        .from('inmuebles')
                        .insert({ ...payload, slug: candidateSlug })
                        .select('id')
                        .single();

                    if (!error) {
                        newInmuebleId = data.id;
                        slug = candidateSlug;
                        break;
                    }
                    if (isSlugConflict(error) && attempt < 3) continue;
                    throw error;
                }
            }

            if (!newInmuebleId) throw new Error('No se pudo obtener el ID del inmueble.');
            const inmuebleId = newInmuebleId;

            // Subir imágenes si existen
            let uploadedByKey = new Map<string, string>();
            if (newPhotos.length > 0) {
                toast.loading('Optimizando a formato WebP...', { id: toastId });
                uploadedByKey = await uploadAndOptimizeImages(inmuebleId);
            }

            const finalPhotos = photoOrder.filter(
                ref => !(ref.kind === 'existing' && markedForDeletion.includes(ref.id))
            );
            const existingOrder = finalPhotos.flatMap((ref, index) =>
                ref.kind === 'existing' ? [{ id: ref.id, orden: index }] : []
            );
            const imageInserts = finalPhotos.flatMap((ref, index) => {
                if (ref.kind !== 'new') return [];
                const uploadedPath = uploadedByKey.get(ref.key);
                return uploadedPath
                    ? [{ inmueble_id: inmuebleId, url_storage: uploadedPath, orden: index }]
                    : [];
            });
            const uploadedPaths = Array.from(uploadedByKey.values());
            let insertedImageIds: string[] = [];

            try {
                if (existingOrder.length > 0) {
                    const results = await Promise.all(
                        existingOrder.map(({ id, orden }) =>
                            supabase.from('imagenes').update({ orden }).eq('id', id)
                        )
                    );
                    const updateError = results.find(result => result.error)?.error;
                    if (updateError) throw updateError;
                }

                if (imageInserts.length > 0) {
                    const { data: insertedImages, error: imgError } = await supabase
                        .from('imagenes')
                        .insert(imageInserts)
                        .select('id');
                    if (imgError) throw imgError;
                    insertedImageIds = (insertedImages || []).map(image => image.id);
                }

                if (markedForDeletion.length > 0) {
                    const { error: deleteError } = await supabase
                        .from('imagenes')
                        .delete()
                        .in('id', markedForDeletion);
                    if (deleteError) throw deleteError;

                    const markedPaths = existingImages
                        .filter(image => markedForDeletion.includes(image.id))
                        .map(image => getStoragePath(image.url_storage || ''))
                        .filter((path): path is string => Boolean(path));

                    if (markedPaths.length > 0) {
                        const { error: storageError } = await supabase.storage
                            .from('fotos-inmuebles')
                            .remove(markedPaths);
                        if (storageError) {
                            toast.error('Fotos eliminadas de la base, pero algunos archivos quedaron en Storage. Usa Limpieza del Servidor.');
                        }
                    }
                }
            } catch (imageError) {
                if (insertedImageIds.length > 0) {
                    const { error: rollbackDbError } = await supabase
                        .from('imagenes')
                        .delete()
                        .in('id', insertedImageIds);
                    if (rollbackDbError) console.error('No se pudieron revertir las imágenes nuevas:', rollbackDbError);
                }
                if (uploadedPaths.length > 0) {
                    const { error: rollbackStorageError } = await supabase.storage
                        .from('fotos-inmuebles')
                        .remove(uploadedPaths);
                    if (rollbackStorageError) console.error('No se pudieron limpiar las imágenes nuevas:', rollbackStorageError);
                }
                throw imageError;
            }

            // El vector de búsqueda se genera en segundo plano: no bloquea el cierre del formulario.
            const pendingSync = syncInmuebleEmbeddings(inmuebleId);

            toast.success(isEditing ? '¡Inmueble actualizado!' : '¡Inmueble publicado!', { id: toastId });
            onSuccess();

            void pendingSync.then(result => {
                if (result.failed === 0) return;

                toast.error(
                    `El inmueble se guardó, pero su búsqueda no se actualizó: ${result.message ?? 'error desconocido'}. Reintenta desde Panel → Búsqueda.`,
                    { duration: 8000 }
                );
            });
        } catch (error: any) {
            toast.error(`Error de Base de Datos: ${error.message}`, { id: toastId });
        } finally {
            setSubmitting(false);
        }
    };

    const requestClose = () => {
        if (submitting) return;
        if (!hasChanges) {
            onClose();
            return;
        }
        setShowDiscardConfirm(true);
    };

    const closeWithoutSaving = () => {
        setShowDiscardConfirm(false);
        onClose();
    };

    // El modal que envuelve al formulario (Escape, botón X del contenedor) debe
    // pasar por `requestClose` para no perder cambios sin avisar.
    useEffect(() => {
        onRegisterClose?.(requestClose);
        // `requestClose` cambia con cada render y solo queremos la versión vigente.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [onRegisterClose, hasChanges, submitting]);

    const firstVisiblePhotoIndex = photoOrder.findIndex(
        ref => !(ref.kind === 'existing' && markedForDeletion.includes(ref.id))
    );

    const expiracionPrevista = expiracionDesdeOpcion(duracion, Number(diasPersonalizados));
    const textoExpiracionPrevista = expiracionPrevista
        ? new Intl.DateTimeFormat('es-BO', {
            day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/La_Paz',
        }).format(new Date(expiracionPrevista))
        : null;
    const vencimientoActual = describirVencimiento(inmueble?.expira_at);

    return (
        <div className="flex flex-col h-full bg-admin-surface relative text-admin-text">
            <div className="flex justify-between items-center p-6 border-b border-admin-border sticky top-0 bg-admin-surface/80 backdrop-blur-md z-10">
                <h2 id="inmueble-modal-title" className="text-2xl font-black text-admin-accent">
                    {isEditing ? 'Editar Inmueble' : 'Nueva Publicación'}
                </h2>
                <button type="button" onClick={requestClose} aria-label="Cerrar formulario" className="text-admin-muted hover:text-admin-accent bg-admin-surface-2 hover:bg-admin-surface-2 p-2 rounded-full transition">
                    <FaTimes size={20} />
                </button>
            </div>

            <div className="p-6 md:p-8">
                <form id="inmuebleForm" onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                        {/* Título y Descripción */}
                        <div className="md:col-span-2 space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-admin-text mb-1">Título de la publicación <span className="text-admin-danger">*</span></label>
                                <input required type="text" name="titulo" value={formData.titulo} onChange={handleChange}
                                    className="w-full px-4 py-3 border border-admin-border rounded-xl focus:ring-admin-accent focus:border-admin-accent bg-admin-surface-2" placeholder="Ej. Hermosa casa en Miraflores" />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-admin-text mb-1">Descripción detallada <span className="text-admin-danger">*</span></label>
                                <textarea required name="descripcion" rows={4} minLength={DESCRIPCION_MIN} maxLength={DESCRIPCION_MAX} value={formData.descripcion} onChange={handleChange}
                                    aria-describedby="descripcion-ayuda"
                                    className="w-full px-4 py-3 border border-admin-border rounded-xl focus:ring-admin-accent focus:border-admin-accent bg-admin-surface-2" placeholder="Describe los beneficios, acabados y entorno..."></textarea>
                                <p id="descripcion-ayuda" className={`text-xs mt-1 text-right ${formData.descripcion.length < DESCRIPCION_MIN ? 'text-admin-danger' : 'text-admin-muted'}`}>
                                    {formData.descripcion.length}/{DESCRIPCION_MAX} · mínimo {DESCRIPCION_MIN}
                                </p>
                            </div>
                        </div>

                        {/* Precios y Tipos */}
                        <div className="space-y-4 md:col-span-2">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="operacion" className="block text-sm font-bold text-admin-text mb-1">Operación</label>
                                    <select id="operacion" name="operacion" value={formData.operacion} onChange={handleChange} className="w-full px-4 py-3 border border-admin-border rounded-xl bg-admin-surface-2">
                                        <option value="Venta">Venta</option>
                                        <option value="Alquiler">Alquiler</option>
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor="tipo_propiedad" className="block text-sm font-bold text-admin-text mb-1">Tipo de Inmueble</label>
                                    <select id="tipo_propiedad" name="tipo_propiedad" value={formData.tipo_propiedad} onChange={handleChange} className="w-full px-4 py-3 border border-admin-border rounded-xl bg-admin-surface-2">
                                        <option value="Casa">Casa</option>
                                        <option value="Lote">Lote</option>
                                        <option value="Departamento">Departamento</option>
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="min-w-0">
                                    <label htmlFor="precio" className="block text-sm font-bold text-admin-text mb-1">
                                        {esAlquiler ? 'Precio por mes' : 'Precio'} <span className="text-admin-danger">*</span>
                                    </label>
                                    <div className="flex items-stretch gap-2">
                                        <select
                                            name="moneda"
                                            value={formData.moneda}
                                            onChange={handleChange}
                                            disabled
                                            aria-label="Moneda fija según la operación"
                                            title={esAlquiler ? 'Los alquileres se publican en bolivianos' : 'Las ventas se publican en dólares'}
                                            className="w-20 shrink-0 px-3 py-3 border border-admin-border rounded-xl bg-admin-surface-2 font-bold text-admin-muted cursor-not-allowed"
                                        >
                                            <option value="USD">USD</option>
                                            <option value="Bs">Bs</option>
                                        </select>
                                        <input id="precio" required type="number" inputMode="decimal" step="any" min="0.01" name="precio" value={formData.precio} onChange={handleChange}
                                            className="min-w-0 flex-1 w-full px-4 py-3 border border-admin-border rounded-xl bg-admin-surface-2" placeholder={esAlquiler ? 'Ej. 2500' : 'Ej. 85000'} />
                                    </div>
                                    <p className="text-[11px] text-admin-muted mt-1">
                                        {esAlquiler ? 'Importe mensual en bolivianos (Bs).' : 'Precio total en dólares (USD).'}
                                    </p>
                                </div>
                            </div>
                            <label className="flex items-center gap-3 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    name="destacado"
                                    checked={Boolean(formData.destacado)}
                                    onChange={e => setFormData(prev => ({ ...prev, destacado: e.target.checked }))}
                                    className="w-5 h-5 accent-admin-accent cursor-pointer"
                                />
                                <span className="text-sm font-bold text-admin-text">Destacado</span>
                                <span className="text-xs text-admin-muted">Aparece primero en el listado público con una insignia.</span>
                            </label>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="md:col-span-1">
                                    <label className="block text-sm font-bold text-admin-text mb-1">WhatsApp Contacto Directo <span className="text-admin-muted font-normal text-[11px]">(opcional)</span></label>
                                    <div className="flex bg-admin-surface-2 border border-admin-border rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-admin-accent focus-within:border-transparent">
                                        <span className="bg-admin-surface-2 px-3 py-3 text-admin-muted font-bold border-r border-admin-border flex items-center pointer-events-none">+591</span>
                                        <input type="tel" name="contacto" value={formData.contacto} onChange={handleChange} placeholder={`Ej. ${whatsappSugerido}`} className="w-full px-3 py-3 bg-transparent focus:outline-none focus:ring-0 border-0" />
                                    </div>
                                    <p className="text-[11px] text-admin-muted mt-1">
                                        Si lo dejas vacío se usará el WhatsApp del negocio ({config.whatsapp}).
                                    </p>
                                </div>
                                {/* ✅ NUEVO CAMPO: Enlace de Google Maps */}
                                <div className="md:col-span-1">
                                    <label className="block text-sm font-bold text-admin-text mb-1">Enlace Google Maps <span className="text-admin-muted font-normal text-[11px]">(opcional)</span></label>
                                    <input
                                        type="url"
                                        name="map_url"
                                        value={formData.map_url}
                                        onChange={handleChange}
                                        placeholder="https://www.google.com/maps/place/..."
                                        className="w-full px-4 py-3 border border-admin-border rounded-xl bg-admin-surface-2 focus:ring-admin-accent focus:border-admin-accent"
                                    />
                                    <p className="text-xs text-admin-muted mt-1">Comparte la ubicación exacta desde Google Maps.</p>
                                </div>
                            </div>
                        </div>

                        {/* Duración de la publicación */}
                        <div className="md:col-span-2 bg-admin-surface-2 p-4 rounded-xl border border-admin-border space-y-3">
                            <div className="flex items-center justify-between gap-3 flex-wrap">
                                <h3 className="font-bold text-admin-accent">Duración de la publicación</h3>
                                {isEditing && (
                                    <span className={`text-xs font-bold px-3 py-1 rounded-full border ${vencimientoActual.tono === 'vencido'
                                        ? 'bg-admin-danger-soft text-admin-danger border-admin-danger/30'
                                        : vencimientoActual.tono === 'aviso'
                                            ? 'bg-admin-warning-soft text-admin-warning border-admin-warning/30'
                                            : 'bg-admin-surface text-admin-muted border-admin-border'}`}>
                                        {vencimientoActual.texto}
                                    </span>
                                )}
                            </div>

                            {isEditing ? (
                                <p className="text-sm text-admin-muted">
                                    {vencimientoActual.detalle}. Para cambiar el vencimiento, usa <strong>Renovar</strong> en el panel de propiedades.
                                </p>
                            ) : (
                                <>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div>
                                            <label htmlFor="duracion" className="block text-sm font-bold text-admin-text mb-1">
                                                ¿Cuánto tiempo estará visible?
                                            </label>
                                            <select
                                                id="duracion"
                                                value={duracion}
                                                onChange={e => setDuracion(e.target.value as DuracionPublicacion)}
                                                className="w-full px-4 py-3 border border-admin-border rounded-xl bg-admin-surface text-sm focus:ring-admin-accent focus:border-admin-accent"
                                            >
                                                {DURACIONES.map(opcion => (
                                                    <option key={opcion.value} value={opcion.value}>{opcion.label}</option>
                                                ))}
                                            </select>
                                        </div>
                                        {duracion === 'personalizado' && (
                                            <div>
                                                <label htmlFor="dias-personalizados" className="block text-sm font-bold text-admin-text mb-1">
                                                    Días de publicación
                                                </label>
                                                <input
                                                    id="dias-personalizados"
                                                    type="number"
                                                    min={1}
                                                    max={3650}
                                                    inputMode="numeric"
                                                    value={diasPersonalizados}
                                                    onChange={e => setDiasPersonalizados(e.target.value)}
                                                    className="w-full px-4 py-3 border border-admin-border rounded-xl bg-admin-surface focus:ring-admin-accent focus:border-admin-accent"
                                                />
                                            </div>
                                        )}
                                    </div>
                                    <p className="text-sm text-admin-muted">
                                        {textoExpiracionPrevista ? (
                                            <>Se verá hasta el <strong className="text-admin-text">{textoExpiracionPrevista}</strong>. Después pasa a “Vencidos” y puedes renovarla.</>
                                        ) : (
                                            <>Se quedará publicada <strong className="text-admin-text">sin fecha de vencimiento</strong> hasta que la pongas en pausa.</>
                                        )}
                                    </p>
                                </>
                            )}
                        </div>

                        {/* Ubicación Nueva (Ciudades + Barrio Libre) */}
                        <div className="bg-admin-surface-2 p-4 rounded-xl border border-admin-border space-y-4">
                            <h3 className="font-bold text-admin-accent">Ubicación (Tarija)</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-bold text-admin-text mb-1">Departamento <span className="text-admin-danger">*</span></label>
                                    <select
                                        required
                                        name="departamento_id"
                                        value={formUbicacion.departamento_id}
                                        onChange={handleUbiChange}
                                        className="w-full px-4 py-3 border border-admin-border rounded-xl bg-admin-surface text-sm focus:ring-admin-accent"
                                    >
                                        <option value="">Seleccione Departamento...</option>
                                        {departamentos.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-admin-text mb-1">Ciudad <span className="text-admin-danger">*</span></label>
                                    <select
                                        required
                                        name="ciudad_id"
                                        value={formUbicacion.ciudad_id}
                                        onChange={handleUbiChange}
                                        disabled={!formUbicacion.departamento_id}
                                        className="w-full px-4 py-3 border border-admin-border rounded-xl bg-admin-surface text-sm focus:ring-admin-accent disabled:bg-admin-surface-2"
                                    >
                                        <option value="">Seleccione Ciudad...</option>
                                        {ciudadesFiltradas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-admin-text mb-1">Barrio <span className="text-admin-danger">*</span></label>
                                <input
                                    required
                                    type="text"
                                    name="barrio_nombre"
                                    value={formUbicacion.barrio_nombre}
                                    onChange={handleUbiChange}
                                    placeholder="Ej. Tabladita, Miraflores..."
                                    className="w-full px-4 py-3 border border-admin-border rounded-xl bg-admin-surface focus:ring-admin-accent focus:border-admin-accent"
                                />
                                <p className="text-xs text-admin-muted mt-1">Si el barrio no existe, se creará mágicamente.</p>
                            </div>
                        </div>

                        {/* Medidas y Ambientes */}
                        <div className="space-y-4 md:col-span-2">
                            <div className={`grid grid-cols-2 ${esLote ? 'md:grid-cols-2' : 'md:grid-cols-4'} gap-4`}>
                                <div>
                                    <label className="block text-sm font-bold text-admin-text mb-1">{esLote ? 'Superficie (m²)' : 'Terreno (m²)'}</label>
                                    <input type="number" step="any" min="0" name="superficie_terreno" value={formData.superficie_terreno} onChange={handleChange} className="w-full px-4 py-3 border border-admin-border rounded-xl bg-admin-surface-2" />
                                </div>
                                {!esLote && (
                                    <>
                                        <div>
                                            <label className="block text-sm font-bold text-admin-text mb-1">Construido (m²)</label>
                                            <input type="number" step="any" min="0" name="superficie_construida" value={formData.superficie_construida} onChange={handleChange} className="w-full px-4 py-3 border border-admin-border rounded-xl bg-admin-surface-2" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-bold text-admin-text mb-1">Habitaciones</label>
                                            <input type="number" step="1" min="0" name="habitaciones" value={formData.habitaciones} onChange={handleChange} className="w-full px-4 py-3 border border-admin-border rounded-xl bg-admin-surface-2" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-bold text-admin-text mb-1">Baños</label>
                                            <input type="number" step="1" min="0" name="banos" value={formData.banos} onChange={handleChange} className="w-full px-4 py-3 border border-admin-border rounded-xl bg-admin-surface-2" />
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Servicios y Comodidades */}
                        <div className="md:col-span-2 bg-admin-surface-2 p-6 rounded-2xl border border-admin-border">
                            <label className="block text-sm font-bold text-admin-text mb-3">Servicios y comodidades <span className="text-admin-muted font-normal text-[11px]">(opcional)</span></label>
                            <div className="flex flex-wrap gap-2">
                                {SERVICIOS_DISPONIBLES.map(servicio => {
                                    const activo = formData.servicios.includes(servicio);
                                    return (
                                        <button
                                            key={servicio}
                                            type="button"
                                            aria-pressed={activo}
                                            onClick={() => toggleServicio(servicio)}
                                            className={`px-4 py-2 rounded-full text-sm font-semibold border transition-colors ${activo ? 'bg-admin-primary text-white border-admin-accent' : 'bg-admin-surface text-admin-muted border-admin-border hover:border-admin-accent hover:text-admin-accent'}`}
                                        >
                                            {servicio}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Área de Fotos Obligatoria */}
                        <div className="md:col-span-2 mt-2 bg-admin-surface-2 p-6 rounded-2xl border border-admin-border border-dashed">
                            <label className="block text-sm font-bold text-admin-text mb-2">Fotos Locales a WebP (Máx 15)</label>

                            <div className="flex flex-wrap gap-4 mb-4">
                                {photoOrder.map((ref, index) => {
                                    const existing = ref.kind === 'existing'
                                        ? existingImages.find(img => img.id === ref.id)
                                        : undefined;
                                    const newPhoto = ref.kind === 'new'
                                        ? newPhotos.find(photo => photo.key === ref.key)
                                        : undefined;

                                    if (!existing && !newPhoto) return null;

                                    const isMarked = existing ? markedForDeletion.includes(existing.id) : false;
                                    const isCover = index === firstVisiblePhotoIndex;
                                    const imageUrl = existing ? getImageUrl(existing.url_storage) : newPhoto!.preview;

                                    return (
                                        <div
                                            key={existing ? `db-${existing.id}` : `new-${newPhoto!.key}`}
                                            className={`relative w-24 h-24 rounded-xl overflow-hidden group shadow-md border-2 ${isMarked ? 'border-admin-danger' : isCover ? 'border-admin-accent' : existing ? 'border-admin-success/30' : 'border-admin-border'}`}
                                        >
                                            <img
                                                src={imageUrl}
                                                className={`object-cover w-full h-full ${isMarked ? 'opacity-30 grayscale' : existing ? 'opacity-80' : ''}`}
                                                alt={isCover ? 'Portada del inmueble' : existing ? 'Foto online' : 'Vista previa de foto nueva'}
                                            />
                                            <div className={`absolute top-0 left-0 z-10 text-[10px] px-1.5 py-0.5 rounded-br-lg ${isMarked ? 'bg-admin-danger-strong text-white' : isCover ? 'bg-admin-primary text-white' : existing ? 'bg-admin-success-strong text-white' : 'bg-admin-surface-2 text-admin-muted'}`}>
                                                {isMarked ? 'Se eliminará' : isCover ? 'Portada' : existing ? 'Online' : 'Nueva'}
                                            </div>
                                            {isMarked ? (
                                                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleExistingPhotoDeletion(existing.id)}
                                                        className="bg-admin-surface text-admin-text text-[10px] font-bold px-2 py-1 rounded-lg shadow hover:bg-admin-surface-2"
                                                    >
                                                        Deshacer
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-0.5 bg-black/60 p-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition">
                                                    <button
                                                        type="button"
                                                        onClick={() => movePhoto(index, -1)}
                                                        disabled={index === 0}
                                                        title="Mover a la izquierda"
                                                        aria-label="Mover foto a la izquierda"
                                                        className="p-1 rounded text-white hover:bg-admin-surface/20 disabled:opacity-30 disabled:cursor-not-allowed"
                                                    >
                                                        <FaArrowLeft size={10} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setCover(index)}
                                                        disabled={index === 0}
                                                        title="Usar como portada"
                                                        aria-label="Usar como portada"
                                                        className="p-1 rounded text-white hover:bg-admin-surface/20 disabled:opacity-30 disabled:cursor-not-allowed"
                                                    >
                                                        <FaStar size={10} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => movePhoto(index, 1)}
                                                        disabled={index === photoOrder.length - 1}
                                                        title="Mover a la derecha"
                                                        aria-label="Mover foto a la derecha"
                                                        className="p-1 rounded text-white hover:bg-admin-surface/20 disabled:opacity-30 disabled:cursor-not-allowed"
                                                    >
                                                        <FaArrowRight size={10} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => existing ? toggleExistingPhotoDeletion(existing.id) : removeNewPhoto(newPhoto!.key)}
                                                        title={existing ? 'Marcar para eliminar' : 'Quitar foto'}
                                                        aria-label={existing ? 'Marcar para eliminar' : 'Quitar foto'}
                                                        className="p-1 rounded text-white hover:bg-admin-danger/30"
                                                    >
                                                        <FaTrash size={10} />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}

                                {(existingImages.length - markedForDeletion.length + newPhotos.length) < 15 && (
                                    <label className="w-24 h-24 flex flex-col items-center justify-center border-2 border-admin-border border-dashed rounded-xl cursor-pointer hover:bg-admin-surface-2 hover:border-admin-accent transition text-admin-muted">
                                        <FaCamera size={24} className="mb-1" />
                                        <span className="text-[10px] font-bold">Añadir Foto</span>
                                        <input type="file" multiple accept="image/*" onChange={handleImageChange} className="hidden" />
                                    </label>
                                )}
                            </div>

                            <p className="text-xs text-admin-accent font-medium block">
                                Hasta 15 fotos combinadas (Online + Nuevas). Usa las flechas para ordenar y la estrella para elegir la portada. Las fotos marcadas se eliminarán al guardar; si cancelas, no se borra nada.
                            </p>
                        </div>

                    </div>
                </form>
            </div>

            <div className="p-6 border-t border-admin-border bg-admin-surface-2 flex justify-end gap-4 rounded-b-3xl">
                <button type="button" onClick={requestClose} disabled={submitting} className="px-6 py-3 rounded-xl font-bold text-admin-muted hover:bg-admin-surface-2 transition">
                    Cancelar
                </button>
                <button type="submit" form="inmuebleForm" disabled={submitting} className="px-8 py-3 rounded-xl font-bold text-white bg-admin-primary hover:bg-admin-primary-hover transition shadow-md flex items-center justify-center min-w-[150px]">
                    {submitting ? <FaSpinner className="animate-spin" /> : (isEditing ? 'Guardar Cambios' : 'Publicar Inmueble')}
                </button>
            </div>

            {showDiscardConfirm && (
                <AccessibleModal
                    onClose={() => setShowDiscardConfirm(false)}
                    labelledBy="discard-title"
                    describedBy="discard-description"
                    overlayClassName="z-[80]"
                    className="w-full max-w-md rounded-3xl bg-admin-surface p-6 shadow-2xl"
                >
                    <h3 id="discard-title" className="text-xl font-black text-admin-accent">
                        Cambios sin guardar
                    </h3>
                    <p id="discard-description" className="mt-3 text-sm text-admin-muted">
                        Si cierras ahora, los cambios que hiciste se perderán.
                    </p>
                    <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                        <button
                            type="button"
                            autoFocus
                            onClick={() => setShowDiscardConfirm(false)}
                            className="rounded-xl px-5 py-3 font-bold text-admin-muted transition hover:bg-admin-surface-2"
                        >
                            Seguir editando
                        </button>
                        <button
                            type="button"
                            onClick={closeWithoutSaving}
                            className="rounded-xl bg-admin-primary px-5 py-3 font-bold text-white transition hover:bg-admin-primary-hover"
                        >
                            Cerrar sin guardar
                        </button>
                    </div>
                </AccessibleModal>
            )}
        </div>
    );
};