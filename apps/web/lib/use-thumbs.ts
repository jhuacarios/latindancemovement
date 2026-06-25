'use client';

import { useEffect, useState } from 'react';

const KEY = 'bl_thumbs';

/**
 * Preferencia "mostrar thumbnails" compartida (catálogo y Mis Canciones) y
 * persistida en localStorage. Activa por defecto: solo se apaga si el usuario
 * la desactivó explícitamente.
 */
export function useThumbs(): [boolean, () => void] {
  const [on, setOn] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(KEY);
    if (stored !== null) setOn(stored === '1');
  }, []);

  const toggle = () =>
    setOn((v) => {
      const next = !v;
      localStorage.setItem(KEY, next ? '1' : '0');
      return next;
    });

  return [on, toggle];
}
