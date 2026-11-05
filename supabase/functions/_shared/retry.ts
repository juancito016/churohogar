/**
 * Reintentos con espera exponencial para llamadas externas (Gemini).
 * Se usa en las Edge Functions, así que no depende de ninguna librería.
 */

export type RetryPolicy = {
    /** Intentos totales, incluido el primero. */
    attempts: number;
    baseDelayMs: number;
    maxDelayMs: number;
};

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
    attempts: 3,
    baseDelayMs: 700,
    maxDelayMs: 6000,
};

/** 408, 429 y 5xx son fallos pasajeros: reintentar tiene sentido. */
export const isRetryableStatus = (status: number) =>
    status === 408 || status === 429 || status >= 500;

/**
 * Espera antes del siguiente intento: `Retry-After` si el servidor lo pide,
 * si no un backoff exponencial acotado por `maxDelayMs`.
 */
export const retryDelayMs = (
    attempt: number,
    policy: RetryPolicy = DEFAULT_RETRY_POLICY,
    retryAfterMs?: number
) => {
    if (typeof retryAfterMs === 'number' && Number.isFinite(retryAfterMs) && retryAfterMs > 0) {
        return Math.min(Math.round(retryAfterMs), policy.maxDelayMs);
    }

    const exponential = policy.baseDelayMs * 2 ** Math.max(attempt - 1, 0);
    return Math.min(Math.round(exponential), policy.maxDelayMs);
};

type RetryOptions = {
    policy?: RetryPolicy;
    /** Decide si el error merece otro intento. Por defecto, no reintenta nadie. */
    isRetryable?: (error: unknown) => boolean;
    /** `Retry-After` del servidor, en milisegundos. */
    getRetryAfterMs?: (error: unknown) => number | undefined;
    /** Permite inyectar otra espera en las pruebas. */
    wait?: (ms: number) => Promise<void>;
    /** Se llama antes de cada reintento (para registrar el aviso en el log). */
    onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
};

const defaultWait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/**
 * Ejecuta `operation` y la reintenta mientras `isRetryable` diga que sí.
 * Si se agotan los intentos, relanza el último error.
 */
export const withRetry = async <T>(
    operation: (attempt: number) => Promise<T>,
    options: RetryOptions = {}
): Promise<T> => {
    const policy = options.policy ?? DEFAULT_RETRY_POLICY;
    const attempts = Math.max(1, policy.attempts);
    const wait = options.wait ?? defaultWait;
    const isRetryable = options.isRetryable ?? (() => false);

    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            return await operation(attempt);
        } catch (error) {
            lastError = error;
            const canRetry = attempt < attempts && isRetryable(error);
            if (!canRetry) throw error;

            const delayMs = retryDelayMs(attempt, policy, options.getRetryAfterMs?.(error));
            options.onRetry?.(error, attempt, delayMs);
            await wait(delayMs);
        }
    }

    throw lastError;
};
