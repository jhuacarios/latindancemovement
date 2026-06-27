'use client';

import { useState } from 'react';
import { API_BASE } from '@/lib/api';
import { clsx } from './clsx';

/**
 * Logo de Nectason (silueta de pareja). Intenta, en orden:
 *  1) el logo subido desde Administración → Configuración del sitio (API),
 *  2) el asset estático `public/brand/nectason-logo.png`,
 *  3) la inicial "N" en Clave, para no romper la UI.
 */
const SOURCES = [
  `${API_BASE}/settings/site/logo`,
  '/brand/nectason-logo.png',
];

export function BrandLogo({ className }: { className?: string }) {
  const [idx, setIdx] = useState(0);

  if (idx >= SOURCES.length) {
    return (
      <span
        className={clsx(
          'flex items-center justify-center font-semibold text-clave',
          className,
        )}
      >
        N
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={SOURCES[idx]}
      alt="Nectason"
      className={clsx('object-contain', className)}
      onError={() => setIdx((i) => i + 1)}
    />
  );
}

/** Logotipo tipográfico: `necta` + `son` (segunda mitad en acento). */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={clsx('font-medium tracking-[-0.02em]', className)}>
      necta<span className="text-clave">son</span>
    </span>
  );
}
