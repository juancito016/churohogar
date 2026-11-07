import { useEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/**
 * Lleva la vista al inicio al navegar hacia adelante (nuevas rutas).
 * Al volver atrás/adelante (POP) no tocamos el scroll: cada vista decide
 * si restaura su posición previa (por ejemplo, el listado de inmuebles).
 */
export const ScrollToTop = () => {
  const { pathname, search } = useLocation();
  const navigationType = useNavigationType();

  useEffect(() => {
    if (navigationType === 'POP') return;
    window.scrollTo(0, 0);
  }, [pathname, search, navigationType]);

  return null;
};
