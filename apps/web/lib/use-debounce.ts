'use client';

import { useEffect, useState } from 'react';

/**
 * Devuelve `value` con un retraso: cambia recién cuando pasan `delayMs` sin que
 * el valor se modifique. Sirve para que, por ejemplo, el input de búsqueda se
 * actualice al instante pero la consulta al servidor se dispare solo al dejar de
 * escribir (no en cada tecla).
 */
export function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}
