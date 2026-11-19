import type { DanceStyle } from './index';

// ---------------------------------------------------------------------------
// Mezcla bachata/salsa: un % de bachata (0–100). El resto es salsa.
// Los `styles` se siguen guardando, deducidos del %, para filtros y avisos.
// ---------------------------------------------------------------------------

/** Paso del deslizador (en %). */
export const STYLE_MIX_STEP = 10;

/** 100 → solo bachata · 0 → solo salsa · otro → ambos. */
export function stylesFromPct(pct: number): DanceStyle[] {
  if (pct >= 100) return ['BACHATA'];
  if (pct <= 0) return ['SALSA'];
  return ['BACHATA', 'SALSA'];
}

/** Estimación para registros antiguos que solo tienen estilos marcados. */
export function pctFromStyles(styles: readonly string[]): number {
  const b = styles.includes('BACHATA');
  const s = styles.includes('SALSA');
  if (b && !s) return 100;
  if (s && !b) return 0;
  return 50;
}

/** "70% bachata · 30% salsa" · "Solo bachata" · "Solo salsa". */
export function styleMixLabel(pct: number): string {
  if (pct >= 100) return 'Solo bachata';
  if (pct <= 0) return 'Solo salsa';
  return `${pct}% bachata · ${100 - pct}% salsa`;
}
