/**
 * ADM-07 — Cierre de sesión por inactividad.
 *
 * - El panel se cierra solo tras `timeoutMs` sin actividad real del administrador
 *   (ratón, teclado, scroll o toque).
 * - Un minuto antes se muestra un aviso con cuenta atrás y la opción
 *   “Seguir conectado”, que reinicia el contador.
 * - El último movimiento se guarda en `localStorage`, así que recargar la página
 *   o abrir otra pestaña no reinicia el plazo por accidente: si de verdad pasó el
 *   tiempo, la sesión se cierra.
 * - Mientras el aviso está visible no se reinicia solo con mover el ratón: hay que
 *   pulsar “Seguir conectado”. Así el aviso no desaparece sin querer.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutos
export const IDLE_WARNING_MS = 60 * 1000; // aviso en el último minuto

const LAST_ACTIVITY_KEY = 'churo:admin-last-activity';
const ACTIVITY_THROTTLE_MS = 5 * 1000;

const now = () => Date.now();

const readStoredActivity = (): number | null => {
    try {
        const raw = localStorage.getItem(LAST_ACTIVITY_KEY);
        const value = raw ? Number(raw) : NaN;
        if (!Number.isFinite(value)) return null;
        // Si el reloj del equipo se movió hacia atrás, no bloquees la sesión.
        return value > now() ? now() : value;
    } catch {
        return null;
    }
};

const storeActivity = (timestamp: number) => {
    try {
        localStorage.setItem(LAST_ACTIVITY_KEY, String(timestamp));
    } catch {
        // Sin almacenamiento disponible seguimos contando solo en memoria.
    }
};

/** Se llama al cerrar sesión para que la próxima entrada empiece con el contador a cero. */
export const clearStoredActivity = () => {
    try {
        localStorage.removeItem(LAST_ACTIVITY_KEY);
    } catch {
        // Nada que limpiar.
    }
};

interface UseIdleLogoutOptions {
    /** Solo cuenta cuando hay sesión de administrador. */
    enabled: boolean;
    onExpire: () => void;
    timeoutMs?: number;
    warningMs?: number;
}

interface IdleLogoutState {
    /** Segundos restantes cuando el aviso está visible; `null` el resto del tiempo. */
    warningSeconds: number | null;
    stayActive: () => void;
}

export const useIdleLogout = ({
    enabled,
    onExpire,
    timeoutMs = IDLE_TIMEOUT_MS,
    warningMs = IDLE_WARNING_MS,
}: UseIdleLogoutOptions): IdleLogoutState => {
    const [warningSeconds, setWarningSeconds] = useState<number | null>(null);
    const lastActivityRef = useRef(0);
    const warningRef = useRef(false);
    const expiredRef = useRef(false);
    const onExpireRef = useRef(onExpire);

    useEffect(() => {
        onExpireRef.current = onExpire;
    }, [onExpire]);

    const stayActive = useCallback(() => {
        const timestamp = now();
        lastActivityRef.current = timestamp;
        storeActivity(timestamp);
        warningRef.current = false;
        setWarningSeconds(null);
    }, []);

    useEffect(() => {
        if (!enabled) {
            warningRef.current = false;
            expiredRef.current = false;
            return;
        }

        expiredRef.current = false;
        lastActivityRef.current = readStoredActivity() ?? now();
        storeActivity(lastActivityRef.current);

        const recordActivity = () => {
            if (warningRef.current || expiredRef.current) return;

            const timestamp = now();
            if (timestamp - lastActivityRef.current < ACTIVITY_THROTTLE_MS) return;

            lastActivityRef.current = timestamp;
            storeActivity(timestamp);
        };

        const activityEvents: Array<keyof DocumentEventMap> = [
            'mousemove',
            'mousedown',
            'keydown',
            'scroll',
            'touchstart',
        ];
        activityEvents.forEach(event =>
            document.addEventListener(event, recordActivity, { passive: true })
        );

        const handleVisibility = () => {
            if (document.visibilityState !== 'visible' || expiredRef.current) return;
            // Otra pestaña pudo haber reiniciado el contador.
            const stored = readStoredActivity();
            if (stored !== null && stored > lastActivityRef.current) lastActivityRef.current = stored;
        };
        document.addEventListener('visibilitychange', handleVisibility);

        const interval = window.setInterval(() => {
            // Otra pestaña pudo marcar actividad (o cerrar sesión) mientras esta
            // estaba en segundo plano: el contador siempre se sincroniza.
            const stored = readStoredActivity();
            if (stored !== null && stored > lastActivityRef.current) lastActivityRef.current = stored;

            const elapsed = now() - lastActivityRef.current;

            if (elapsed >= timeoutMs) {
                if (expiredRef.current) return;
                expiredRef.current = true;
                warningRef.current = false;
                clearStoredActivity();
                setWarningSeconds(null);
                onExpireRef.current();
                return;
            }

            const remaining = timeoutMs - elapsed;
            if (remaining <= warningMs) {
                warningRef.current = true;
                setWarningSeconds(Math.max(1, Math.ceil(remaining / 1000)));
                return;
            }

            if (warningRef.current) {
                // Otra pestaña reinició el contador mientras tanto.
                warningRef.current = false;
                setWarningSeconds(null);
            }
        }, 1000);

        return () => {
            activityEvents.forEach(event => document.removeEventListener(event, recordActivity));
            document.removeEventListener('visibilitychange', handleVisibility);
            window.clearInterval(interval);
        };
    }, [enabled, timeoutMs, warningMs]);

    return { warningSeconds: enabled ? warningSeconds : null, stayActive };
};
