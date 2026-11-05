/**
 * Registro estructurado: una línea JSON por evento, con un campo `evt` estable.
 *
 * Existe para poder contar desde el explorador de logs de Supabase cosas que la
 * respuesta no conserva: cuántas búsquedas se sirven de caché, qué zonas se
 * detectan, cuánto tarda cada tramo y qué consultas fallan. Sin esto la tasa de
 * acierto de caché (sección 9 del plan) no se puede medir.
 *
 * Nunca se registran claves, tokens ni vectores; solo el texto normalizado y
 * recortado de la consulta.
 */

type LogLevel = 'info' | 'warn' | 'error';

type LogFields = Record<string, unknown>;

const MAX_QUERY_LOG_LENGTH = 120;

const describeError = (error: unknown) => {
    if (error instanceof Error) {
        return { name: error.name, message: error.message, stack: error.stack ?? null };
    }

    if (error && typeof error === 'object') {
        const { message, code, details, hint } = error as Record<string, unknown>;
        if (message || code) return { message, code, details, hint };
        try {
            return { message: JSON.stringify(error) };
        } catch {
            return { message: String(error) };
        }
    }

    return { message: String(error) };
};

const write = (level: LogLevel, evt: string, fields: LogFields) => {
    let line: string;
    try {
        line = JSON.stringify({ evt, at: new Date().toISOString(), ...fields });
    } catch {
        line = JSON.stringify({ evt, at: new Date().toISOString(), log_error: 'no serializable' });
    }

    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.info(line);
};

/** Recorta y aplana la consulta para que una línea de log siga siendo legible. */
export const shortQuery = (value: string) => {
    const flat = value.replace(/\s+/g, ' ').trim();
    return flat.length > MAX_QUERY_LOG_LENGTH ? `${flat.slice(0, MAX_QUERY_LOG_LENGTH)}…` : flat;
};

export const logInfo = (evt: string, fields: LogFields = {}) => write('info', evt, fields);

export const logWarn = (evt: string, fields: LogFields = {}) => write('warn', evt, fields);

export const logError = (evt: string, error: unknown, fields: LogFields = {}) =>
    write('error', evt, { ...fields, error: describeError(error) });
