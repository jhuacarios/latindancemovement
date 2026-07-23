'use client';

import { useEffect, useState } from 'react';

/** Mismo corte que el resto de la UI (Tailwind `lg`): < 1024px = móvil. */
const MOBILE_QUERY = '(max-width: 1023px)';

/**
 * `true` en anchos de móvil, reaccionando a los cambios de tamaño. Arranca en
 * `false` (coincide con el render del servidor, que asume escritorio) y se
 * ajusta al montar, evitando desajustes de hidratación.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return isMobile;
}
