/**
 * Entrada de historial para el visor de fotos.
 *
 * El visor es una capa de React, no una ruta: sin una entrada propia, el botón
 * atrás del móvil desmonta la ficha o el panel y vuelve a la pantalla anterior.
 * Al abrirlo se empuja una entrada con la misma URL y una marca; el visor
 * escucha `popstate` y se cierra consumiéndola.
 */

const KEY = '__churoLightbox';

type HistoryState = Record<string, unknown> & { [KEY]?: boolean };

const currentState = (): HistoryState | null => {
    if (typeof window === 'undefined') return null;
    return (window.history.state as HistoryState | null) ?? null;
};

export const pushLightboxHistory = () => {
    if (typeof window === 'undefined') return;
    if (currentState()?.[KEY]) return;
    window.history.pushState({ ...(currentState() ?? {}), [KEY]: true }, '');
};

export const isLightboxHistoryActive = () => Boolean(currentState()?.[KEY]);

export const consumeLightboxHistory = () => {
    if (typeof window === 'undefined') return;
    if (isLightboxHistoryActive()) window.history.back();
};
