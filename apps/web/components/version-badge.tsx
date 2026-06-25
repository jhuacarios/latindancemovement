import { APP_VERSION } from '@/lib/version';

/**
 * Insignia de versión fija en la esquina inferior derecha. Visible en todas las
 * páginas, semi-transparente y sin capturar clicks (no estorba la UI).
 */
export function VersionBadge() {
  return (
    <div
      className="pointer-events-none fixed bottom-1.5 right-2 z-50 select-none text-[10px] text-neutral-500/50"
      title="Versión de la app"
    >
      v{APP_VERSION}
    </div>
  );
}
