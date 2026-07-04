'use client';

import { createContext, useContext } from 'react';
import type { UserRole } from '@baile-latino/types';

interface ViewAsRoleValue {
  /** Rol que un super admin está previsualizando (null = su rol real). */
  viewAsRole: UserRole | null;
  setViewAsRole: (r: UserRole | null) => void;
}

export const ViewAsRoleContext = createContext<ViewAsRoleValue>({
  viewAsRole: null,
  setViewAsRole: () => {},
});

/**
 * Permite a un super admin previsualizar la app como otro rol (solo UI: el rol
 * real en el JWT no cambia, así que siempre puede volver). Sirve para auditar
 * qué ve y a qué accede cada rol.
 */
export function useViewAsRole(): ViewAsRoleValue {
  return useContext(ViewAsRoleContext);
}
