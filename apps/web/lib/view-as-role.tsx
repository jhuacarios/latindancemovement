'use client';

import { createContext, useContext } from 'react';
import type { UserRole } from '@baile-latino/types';
import { useAuth } from './auth';

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

/**
 * Rol a usar para gatear la UI: el previsualizado si un super admin está
 * "viendo como" otro rol, o el real en caso contrario. Así los bloques
 * gateados dentro de las páginas (no solo el menú) respetan la vista previa.
 */
export function useEffectiveRole(): UserRole | undefined {
  const { user } = useAuth();
  const { viewAsRole } = useViewAsRole();
  if (!user) return undefined;
  return user.role === 'SUPER_ADMIN' && viewAsRole ? viewAsRole : user.role;
}
