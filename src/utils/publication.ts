/**
 * Utilidades de duración de las publicaciones.
 *
 * Regla de negocio: una publicación de N días se ve desde hoy hasta el final del
 * día N (contando hoy como el día 1). "30 días" publicada el 1 de noviembre se ve
 * hasta el 30 de noviembre a las 23:59 de Bolivia, no a media mañana.
 */

export type DuracionPublicacion = '30' | '90' | '180' | '365' | 'personalizado' | 'permanente';

const DIA_MS = 24 * 60 * 60 * 1000;
/** Bolivia es UTC-4 todo el año: no hay horario de verano que corregir. */
const OFFSET_BOLIVIA_MS = -4 * 60 * 60 * 1000;

export const DURACIONES: { value: DuracionPublicacion; label: string }[] = [
    { value: '30', label: '1 mes (30 días)' },
    { value: '90', label: '3 meses (90 días)' },
    { value: '180', label: '6 meses (180 días)' },
    { value: '365', label: '1 año (365 días)' },
    { value: 'personalizado', label: 'Personalizado…' },
    { value: 'permanente', label: 'Permanente' },
];

export const sumarDias = (fecha: Date, dias: number) => new Date(fecha.getTime() + dias * DIA_MS);

/** Último instante del día en Bolivia (23:59:59.999), devuelto en UTC. */
export const finDeDiaBolivia = (fecha: Date) => {
    const local = new Date(fecha.getTime() + OFFSET_BOLIVIA_MS);
    const finLocal = Date.UTC(
        local.getUTCFullYear(),
        local.getUTCMonth(),
        local.getUTCDate(),
        23, 59, 59, 999,
    );
    return new Date(finLocal - OFFSET_BOLIVIA_MS);
};

/** Instante de vencimiento para una duración en días (hoy cuenta como día 1). */
export const calcularExpiracion = (dias: number, desde: Date = new Date()) => {
    if (!Number.isFinite(dias) || dias < 1) return null;
    return finDeDiaBolivia(sumarDias(desde, Math.floor(dias) - 1));
};

/**
 * Convierte la opción del formulario en `expira_at`.
 * `null` significa publicación permanente.
 */
export const expiracionDesdeOpcion = (
    opcion: DuracionPublicacion,
    diasPersonalizados: number,
    desde: Date = new Date(),
): string | null => {
    if (opcion === 'permanente') return null;
    const dias = opcion === 'personalizado' ? diasPersonalizados : Number(opcion);
    const fecha = calcularExpiracion(dias, desde);
    return fecha ? fecha.toISOString() : null;
};

const finDeDiaISO = (iso: string) => finDeDiaBolivia(new Date(iso)).getTime();

/** Días completos que faltan para que venza (negativo si ya venció). */
export const diasParaVencer = (expiraAt?: string | null) => {
    if (!expiraAt) return null;
    const fin = finDeDiaISO(expiraAt);
    if (Number.isNaN(fin)) return null;
    const hoy = finDeDiaBolivia(new Date()).getTime();
    return Math.round((fin - hoy) / DIA_MS);
};

export type EstadoVencimiento = {
    texto: string;
    tono: 'neutral' | 'ok' | 'aviso' | 'vencido';
    /** Para `title` (tooltip) con la fecha exacta. */
    detalle: string;
};

export const describirVencimiento = (expiraAt?: string | null): EstadoVencimiento => {
    const fecha = expiraAt ? new Intl.DateTimeFormat('es-BO', {
        day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/La_Paz',
    }).format(new Date(expiraAt)) : '';

    if (!expiraAt) {
        return { texto: 'Permanente', tono: 'neutral', detalle: 'Esta publicación no vence' };
    }

    const dias = diasParaVencer(expiraAt);
    if (dias === null) {
        return { texto: 'Permanente', tono: 'neutral', detalle: 'Esta publicación no vence' };
    }

    if (dias < 0) {
        return {
            texto: `Vencido hace ${Math.abs(dias)} día${Math.abs(dias) === 1 ? '' : 's'}`,
            tono: 'vencido',
            detalle: `Venció el ${fecha}`,
        };
    }

    if (dias === 0) {
        return { texto: 'Vence hoy', tono: 'aviso', detalle: `Vence hoy, ${fecha}` };
    }

    if (dias <= 3) {
        return {
            texto: `Vence en ${dias} día${dias === 1 ? '' : 's'}`,
            tono: 'aviso',
            detalle: `Vence el ${fecha}`,
        };
    }

    return { texto: `${dias} días`, tono: 'ok', detalle: `Vence el ${fecha}` };
};
