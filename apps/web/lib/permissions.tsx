'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import type {
  PermissionAction,
  PermissionsMatrix,
  UserRole,
} from '@baile-latino/types';
import { api } from './api';
import { useAuth } from './auth';
import { MODULES, type AppModule } from './modules';

interface PermissionsContextValue {
  loaded: boolean;
  matrix: PermissionsMatrix;
  /** ¿El rol puede `action` en el módulo `key`? Cae a los defaults del código. */
  can: (role: UserRole, key: string, action: PermissionAction) => boolean;
  /** Módulos visibles (acción 'ver') para el rol. */
  accessibleModules: (role: UserRole) => AppModule[];
  reload: () => Promise<void>;
}

const PermissionsContext = createContext<PermissionsContextValue | null>(null);

export function PermissionsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [matrix, setMatrix] = useState<PermissionsMatrix>({});
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    try {
      const res = await api<{ matrix: PermissionsMatrix }>('/admin/permissions');
      setMatrix(res.matrix ?? {});
    } catch {
      setMatrix({});
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setLoaded(true);
      return;
    }
    void reload();
  }, [user, reload]);

  const can = useCallback(
    (role: UserRole, key: string, action: PermissionAction): boolean => {
      if (role === 'SUPER_ADMIN') return true;
      const saved = matrix?.[role]?.[key];
      if (saved) return Boolean(saved[action]);
      // Default: si el rol está en los roles por defecto del módulo, puede las 3.
      const mod = MODULES.find((m) => m.key === key);
      return mod ? mod.roles.includes(role) : false;
    },
    [matrix],
  );

  const accessibleModules = useCallback(
    (role: UserRole): AppModule[] =>
      MODULES.filter((m) => can(role, m.key, 'ver')),
    [can],
  );

  return (
    <PermissionsContext.Provider
      value={{ loaded, matrix, can, accessibleModules, reload }}
    >
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions(): PermissionsContextValue {
  const ctx = useContext(PermissionsContext);
  if (!ctx)
    throw new Error('usePermissions debe usarse dentro de <PermissionsProvider>');
  return ctx;
}
