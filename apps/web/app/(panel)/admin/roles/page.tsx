'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  PERMISSION_ACTIONS,
  USER_ROLES,
  type ModulePerms,
  type PermissionsMatrix,
  type UserRole,
} from '@baile-latino/types';
import { api, ApiError } from '@/lib/api';
import { MODULES } from '@/lib/modules';
import { usePermissions } from '@/lib/permissions';
import { Button, Card, Select, Spinner } from '@/components/ui';

const EDITABLE_ROLES = USER_ROLES.filter((r) => r !== 'SUPER_ADMIN');

function defaultPerms(role: UserRole, key: string): ModulePerms {
  const mod = MODULES.find((m) => m.key === key);
  const allowed = mod ? mod.roles.includes(role) : false;
  return { ver: allowed, editar: allowed, eliminar: allowed };
}

function buildFullMatrix(saved: PermissionsMatrix): PermissionsMatrix {
  const full: PermissionsMatrix = {};
  for (const role of EDITABLE_ROLES) {
    full[role] = {};
    for (const mod of MODULES) {
      full[role][mod.key] = saved?.[role]?.[mod.key] ?? defaultPerms(role, mod.key);
    }
  }
  return full;
}

export default function RolesPage() {
  const perms = usePermissions();
  const [role, setRole] = useState<UserRole>(EDITABLE_ROLES[0]);
  const [matrix, setMatrix] = useState<PermissionsMatrix | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-permissions'],
    queryFn: () => api<{ matrix: PermissionsMatrix }>('/admin/permissions'),
  });

  useEffect(() => {
    if (data) setMatrix(buildFullMatrix(data.matrix ?? {}));
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      api('/admin/permissions', { method: 'PUT', body: { matrix } }),
    onSuccess: async () => {
      setSavedMsg('Permisos guardados.');
      await perms.reload();
      setTimeout(() => setSavedMsg(null), 2500);
    },
    onError: (e) =>
      setErr(e instanceof ApiError ? e.message : 'No se pudo guardar'),
  });

  function toggle(key: string, action: keyof ModulePerms, value: boolean) {
    setMatrix((prev) => {
      if (!prev) return prev;
      const cur = prev[role][key];
      const next: ModulePerms = { ...cur, [action]: value };
      // Si quitas "ver", no tiene sentido editar/eliminar.
      if (action === 'ver' && !value) {
        next.editar = false;
        next.eliminar = false;
      }
      // Si activas editar/eliminar, asegura "ver".
      if ((action === 'editar' || action === 'eliminar') && value) {
        next.ver = true;
      }
      return {
        ...prev,
        [role]: { ...prev[role], [key]: next },
      };
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Roles y permisos</h1>
        <p className="text-sm text-neutral-400">
          Define qué puede <b>ver</b>, <b>editar</b> y <b>eliminar</b> cada rol en
          cada módulo. (Reglas más finas, a futuro, tendrán prioridad.)
        </p>
      </div>

      <Card className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-neutral-300">Rol:</label>
        <Select value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
          {EDITABLE_ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </Select>
        <span className="text-xs text-neutral-500">
          SUPER_ADMIN siempre tiene acceso total (no editable).
        </span>
        <div className="ml-auto flex items-center gap-3">
          {savedMsg && <span className="text-sm text-emerald-300">{savedMsg}</span>}
          {err && <span className="text-sm text-red-300">{err}</span>}
          <Button
            disabled={!matrix || save.isPending}
            onClick={() => {
              setErr(null);
              save.mutate();
            }}
          >
            {save.isPending ? 'Guardando…' : 'Guardar cambios'}
          </Button>
        </div>
      </Card>

      {(isLoading || !matrix) && <Spinner />}

      {matrix && (
        <Card className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-800 text-left text-neutral-400">
              <tr>
                <th className="px-4 py-3">Módulo</th>
                {PERMISSION_ACTIONS.map((a) => (
                  <th key={a} className="px-4 py-3 w-24 text-center capitalize">
                    {a}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MODULES.map((m) => {
                const p = matrix[role][m.key];
                return (
                  <tr
                    key={m.key}
                    className="border-b border-neutral-800/60 last:border-0"
                  >
                    <td className="px-4 py-3">
                      <span className="mr-2">{m.icon}</span>
                      {m.title}
                    </td>
                    {PERMISSION_ACTIONS.map((a) => (
                      <td key={a} className="px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-[var(--color-brand)]"
                          checked={p[a]}
                          onChange={(e) => toggle(m.key, a, e.target.checked)}
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
