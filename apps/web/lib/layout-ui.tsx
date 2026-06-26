'use client';

import { createContext, useContext } from 'react';

interface LayoutUI {
  /** Si el menú lateral está contraído (modo solo-iconos). */
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
}

export const LayoutUIContext = createContext<LayoutUI>({
  collapsed: false,
  setCollapsed: () => {},
});

/** Permite a las páginas contraer/expandir el menú lateral del panel. */
export function useLayoutUI(): LayoutUI {
  return useContext(LayoutUIContext);
}
