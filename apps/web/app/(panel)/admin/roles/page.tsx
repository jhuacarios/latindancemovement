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
import type { PermissionAction } from '@baile-latino/types';
import { api, ApiError } from '@/lib/api';
import { permTree, defaultRolesForKey } from '@/lib/modules';
import { usePermissions } from '@/lib/permissions';
import { useViewAsRole } from '@/lib/view-as-role';
import { Button, Card, Select, Spinner } from '@/components/ui';
import { clsx } from '@/components/clsx';

const EDITABLE_ROLES = USER_ROLES.filter((r) => r !== 'SUPER_ADMIN');

function defaultPerms(role: UserRole, key: string): ModulePerms {
  const allowed = defaultRolesForKey(key).includes(role);
  return { ver: allowed, editar: allowed, eliminar: allowed };
}

function buildFullMatrix(saved: PermissionsMatrix): PermissionsMatrix {
  const full: PermissionsMatrix = {};
  for (const role of EDITABLE_ROLES) {
    full[role] = {};
    for (const node of permTree()) {
      full[role][node.key] = saved?.[role]?.[node.key] ?? defaultPerms(role, node.key);
    }
  }
  return full;
}

export default function RolesPage() {
  const perms = usePermissions();
  const [mode, setMode] = useState<'edit' | 'compare'>('compare');
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

      <div className="inline-flex rounded-lg border border-neutral-700 p-0.5">
        {(['compare', 'edit'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={clsx(
              'rounded-md px-3 py-1.5 text-sm transition',
              mode === m
                ? 'bg-brand text-white'
                : 'text-neutral-300 hover:bg-neutral-800',
            )}
          >
            {m === 'compare' ? 'Comparar roles' : 'Editar por rol'}
          </button>
        ))}
      </div>

      {mode === 'compare' && <CompareMatrix />}

      {mode === 'edit' && (
        <>
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
              {permTree().map((node) => {
                const p = matrix[role][node.key];
                if (!p) return null;
                return (
                  <tr
                    key={node.key}
                    className={
                      'border-b border-neutral-800/60 transition-colors last:border-0 hover:bg-brand/5 ' +
                      (node.depth === 0 ? 'font-medium' : 'text-neutral-300')
                    }
                  >
                    <td
                      className="py-2.5 pr-4"
                      style={{ paddingLeft: `${1 + node.depth * 1.5}rem` }}
                    >
                      {node.depth > 0 && (
                        <span className="mr-1 text-neutral-600">└</span>
                      )}
                      {node.label}
                    </td>
                    {PERMISSION_ACTIONS.map((a) => (
                      <td key={a} className="px-4 py-2.5 text-center">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-[var(--color-brand)]"
                          checked={p[a]}
                          onChange={(e) => toggle(node.key, a, e.target.checked)}
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
        </>
      )}
    </div>
  );
}

/** Símbolos por acción para la matriz comparativa. */
const ACTION_LABEL: Record<PermissionAction, string> = {
  ver: 'Ver',
  editar: 'Editar',
  eliminar: 'Eliminar',
};

/**
 * Vista de solo lectura: todos los roles a la vez (columnas) contra cada
 * módulo/sección (filas), para auditar de un vistazo. Refleja los permisos
 * efectivos (guardados + defaults). Cada columna permite "Ver como" ese rol.
 */
function CompareMatrix() {
  const perms = usePermissions();
  const { setViewAsRole } = useViewAsRole();
  const [action, setAction] = useState<PermissionAction>('ver');
  const nodes = permTree();

  return (
    <div className="space-y-3">
      <Card className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-neutral-300">Acción a comparar:</label>
        <Select
          value={action}
          onChange={(e) => setAction(e.target.value as PermissionAction)}
        >
          {PERMISSION_ACTIONS.map((a) => (
            <option key={a} value={a}>
              {ACTION_LABEL[a]}
            </option>
          ))}
        </Select>
        <span className="text-xs text-neutral-500">
          ✓ = el rol puede {ACTION_LABEL[action].toLowerCase()} · usa “👁” en la
          cabecera para previsualizar la app como ese rol.
        </span>
      </Card>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-neutral-800 text-neutral-400">
            <tr>
              <th className="sticky left-0 z-10 bg-neutral-900 px-4 py-3 text-left">
                Módulo / sección
              </th>
              {USER_ROLES.map((r) => (
                <th key={r} className="px-2 py-3 text-center align-bottom">
                  <div className="flex flex-col items-center gap-1">
                    <span
                      className={clsx(
                        'text-[11px] font-semibold',
                        r === 'SUPER_ADMIN'
                          ? 'text-brand'
                          : 'text-neutral-300',
                      )}
                    >
                      {r}
                    </span>
                    {r !== 'SUPER_ADMIN' && (
                      <button
                        type="button"
                        title={`Ver la app como ${r}`}
                        onClick={() => setViewAsRole(r)}
                        className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-400 transition hover:bg-brand/20 hover:text-brand"
                      >
                        👁 Ver como
                      </button>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {nodes.map((node) => (
              <tr
                key={node.key}
                className={clsx(
                  'border-b border-neutral-800/60 last:border-0 hover:bg-brand/5',
                  node.depth === 0 ? 'font-medium' : 'text-neutral-300',
                )}
              >
                <td
                  className="sticky left-0 z-10 bg-neutral-900 py-2.5 pr-4"
                  style={{ paddingLeft: `${1 + node.depth * 1.5}rem` }}
                >
                  {node.depth > 0 && (
                    <span className="mr-1 text-neutral-600">└</span>
                  )}
                  {node.label}
                </td>
                {USER_ROLES.map((r) => {
                  const ok = perms.can(r, node.key, action);
                  return (
                    <td key={r} className="px-2 py-2.5 text-center">
                      {ok ? (
                        <span className="text-emerald-400">✓</span>
                      ) : (
                        <span className="text-neutral-700">·</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
