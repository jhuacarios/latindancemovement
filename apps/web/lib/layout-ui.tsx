'use client';

import { createContext, useContext } from 'react';

interface LayoutUI {
  /** Si el menú lateral está contraído (modo solo-iconos). */
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  /**
   * Clave de subítem del menú a marcar como activo cuando la ruta no basta
   * (ej: el detalle de playlist vive en una ruta compartida y solo la página
   * sabe si es de Spotify o YouTube). null = usar solo la ruta.
   */
  activeNavKey: string | null;
  setActiveNavKey: (v: string | null) => void;
}

export const LayoutUIContext = createContext<LayoutUI>({
  collapsed: false,
  setCollapsed: () => {},
  activeNavKey: null,
  setActiveNavKey: () => {},
});

/** Permite a las páginas contraer/expandir el menú lateral del panel. */
export function useLayoutUI(): LayoutUI {
  return useContext(LayoutUIContext);
}
