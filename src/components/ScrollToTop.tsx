import { useEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/**
 * Lleva la vista al inicio al entrar en una ruta distinta.
 * Al volver atrás/adelante (POP) no tocamos el scroll: cada vista decide
 * si restaura su posición previa (por ejemplo, el listado de inmuebles).
 *
 * Se compara la ruta con la anterior en un ref: cambiar solo la query
 * (`?q=`, filtros) es una búsqueda dentro de la misma página y no debe
 * devolver la vista al principio.
 */
export const ScrollToTop = () => {
  const { pathname } = useLocation();
  const navigationType = useNavigationType();
  const lastPathname = useRef(pathname);

  useEffect(() => {
    if (lastPathname.current === pathname) return;
    lastPathname.current = pathname;
    if (navigationType === 'POP') return;
    window.scrollTo(0, 0);
  }, [pathname, navigationType]);

  return null;
};
