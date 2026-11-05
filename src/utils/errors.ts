/**
 * ADM-33 — Traducción de errores del panel.
 *
 * Supabase devuelve mensajes de Postgres en inglés y con códigos. Aquí se
 * convierten en una frase en español que dice qué pasó y qué hacer, para no
 * mostrar nunca un error crudo al administrador.
 */

type ErrorLike = {
    message?: unknown;
    code?: unknown;
    details?: unknown;
    hint?: unknown;
};

const POR_CODIGO: Record<string, string> = {
    '23505': 'Ya existe un registro con ese nombre. Usa otro o edita el existente.',
    '23503': 'No se puede completar porque hay inmuebles u otros datos asociados. Reasígnalos primero.',
    '23514': 'Los datos no cumplen las validaciones. Revisa el formulario e intenta de nuevo.',
    '23502': 'Falta un dato obligatorio. Completa el formulario e intenta de nuevo.',
    '22P02': 'Alguno de los datos tiene un formato inválido. Revisa el formulario.',
    '22001': 'Uno de los textos es demasiado largo. Acórtalo e intenta de nuevo.',
    '42501': 'No tienes permisos para esta acción. Vuelve a iniciar sesión como administrador.',
    '21000': 'La operación no se pudo completar. Recarga la página e intenta de nuevo.',
    PGRST301: 'Tu sesión caducó. Vuelve a iniciar sesión.',
    PGRST116: 'No se encontró el registro. Actualiza la lista e intenta de nuevo.',
    'PGRST204': 'La operación no se pudo guardar. Recarga la página e intenta de nuevo.',
};

const leerMensaje = (error: unknown): string => {
    if (!error) return '';
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    if (typeof error === 'object' && error !== null) {
        const { message } = error as ErrorLike;
        if (typeof message === 'string') return message;
    }
    return '';
};

const leerCodigo = (error: unknown): string => {
    if (typeof error === 'object' && error !== null && 'code' in error) {
        const { code } = error as ErrorLike;
        if (typeof code === 'string') return code;
    }
    return '';
};

/** Mensaje en inglés o demasiado técnico: mejor usar el texto de respaldo. */
const pareceTecnico = (message: string) => {
    const lower = message.toLowerCase();
    return [
        'violates',
        'duplicate key',
        'permission denied',
        'row-level security',
        'null value',
        'invalid input',
        'column',
        'relation',
        'constraint',
        'syntax error',
        'failed to fetch',
        'networkerror',
        'load failed',
        'jwt',
        'pgrst',
        'postgrest',
        'edge function',
        'non-2xx',
    ].some(fragmento => lower.includes(fragmento));
};

export const mensajeError = (error: unknown, respaldo: string): string => {
    const codigo = leerCodigo(error);
    if (codigo && POR_CODIGO[codigo]) return POR_CODIGO[codigo];

    const mensaje = leerMensaje(error).trim();
    if (!mensaje) return respaldo;

    const lower = mensaje.toLowerCase();

    if (lower.includes('jwt') && (lower.includes('expired') || lower.includes('invalid'))) {
        return 'Tu sesión caducó. Vuelve a iniciar sesión.';
    }
    if (lower.includes('row-level security') || lower.includes('permission denied')) {
        return 'No tienes permisos para esta acción. Vuelve a iniciar sesión como administrador.';
    }
    if (lower.includes('duplicate key')) {
        return 'Ya existe un registro con ese nombre. Usa otro o edita el existente.';
    }
    if (lower.includes('failed to fetch') || lower.includes('networkerror') || lower.includes('load failed')) {
        return 'No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.';
    }
    if (lower.includes('timeout') || lower.includes('timed out')) {
        return 'La operación tardó demasiado. Intenta de nuevo en unos segundos.';
    }
    if (pareceTecnico(mensaje)) return respaldo;

    return mensaje;
};
