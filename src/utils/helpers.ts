import { supabase } from '../services/supabaseClient';

export const getImageUrl = (pathOrUrl: string) => {
    if (!pathOrUrl) return '';
    if (pathOrUrl.startsWith('http')) return pathOrUrl;
    return supabase.storage.from('fotos-inmuebles').getPublicUrl(pathOrUrl).data.publicUrl;
};

export const getStoragePath = (pathOrUrl: string) => {
    if (!pathOrUrl) return '';
    if (!pathOrUrl.startsWith('http')) return pathOrUrl;

    const marker = '/fotos-inmuebles/';
    const markerIndex = pathOrUrl.indexOf(marker);
    if (markerIndex === -1) return '';

    return pathOrUrl.slice(markerIndex + marker.length).split('?')[0];
};

export const formatPrecio = (precio: number, moneda: string) => {
    const value = Number.isFinite(precio) ? precio : 0;
    return `${moneda} ${new Intl.NumberFormat('es-BO', { maximumFractionDigits: 0 }).format(value)}`;
};

export const formatFecha = (iso?: string | null) => {
    if (!iso) return '—';

    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '—';

    return new Intl.DateTimeFormat('es-BO', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    }).format(date);
};
