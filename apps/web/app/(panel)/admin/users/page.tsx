'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { USER_ROLES, type PublicUser, type UserRole } from '@baile-latino/types';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  ConfirmDialog,
  type ConfirmOptions,
} from '@/components/confirm-dialog';
import { Button, Card, Input, Select, Spinner } from '@/components/ui';

export default function AdminUsersPage() {
  const qc = useQueryClient();
  const { user: me } = useAuth();
  const [form, setForm] = useState({
    email: '',
    password: '',
    name: '',
    role: 'BAILARIN' as UserRole,
    city: '',
  });
  const [err, setErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => api<PublicUser[]>('/admin/users'),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin-users'] });

  const create = useMutation({
    mutationFn: () => api<PublicUser>('/admin/users', { method: 'POST', body: form }),
    onSuccess: () => {
      setForm({ email: '', password: '', name: '', role: 'BAILARIN', city: '' });
      void invalidate();
    },
    onError: (e) =>
      setErr(e instanceof ApiError ? e.message : 'No se pudo crear el usuario'),
  });

  const changeRole = useMutation({
    mutationFn: (vars: { id: string; role: UserRole }) =>
      api(`/admin/users/${vars.id}`, { method: 'PATCH', body: { role: vars.role } }),
    onSuccess: () => void invalidate(),
    onError: (e) =>
      setErr(e instanceof ApiError ? e.message : 'No se pudo cambiar el rol'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/admin/users/${id}`, { method: 'DELETE' }),
    onSuccess: () => void invalidate(),
    onError: (e) =>
      setErr(e instanceof ApiError ? e.message : 'No se pudo eliminar'),
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Usuarios</h1>
        <p className="text-sm text-neutral-400">
          Crea, edita el rol y elimina usuarios de la plataforma.
        </p>
      </div>

      <Card>
        <h2 className="mb-3 font-semibold">Nuevo usuario</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Input
            placeholder="Email *"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <Input
            placeholder="Nombre *"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Input
            placeholder="Contraseña * (mín. 8)"
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <Select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
          >
            {USER_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
          <Input
            placeholder="Ciudad (opcional)"
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
          />
          <div className="flex items-center">
            <Button
              disabled={
                !form.email || !form.name || form.password.length < 8 || create.isPending
              }
              onClick={() => {
                setErr(null);
                create.mutate();
              }}
            >
              {create.isPending ? 'Creando…' : '+ Crear usuario'}
            </Button>
          </div>
        </div>
        {err && <p className="mt-3 text-sm text-red-300">{err}</p>}
      </Card>

      {isLoading && <Spinner />}

      {data && (
        <Card className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-800 text-left text-neutral-400">
              <tr>
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3 w-48">Rol</th>
                <th className="px-4 py-3">Ciudad</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {data.map((u) => {
                const isMe = u.id === me?.id;
                return (
                  <tr key={u.id} className="border-b border-neutral-800/60 last:border-0">
                    <td className="px-4 py-3 font-medium">
                      {u.name}
                      {isMe && (
                        <span className="ml-2 rounded bg-neutral-800 px-1.5 py-0.5 text-xs text-neutral-400">
                          tú
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-neutral-300">{u.email}</td>
                    <td className="px-4 py-3">
                      <Select
                        value={u.role}
                        disabled={isMe}
                        onChange={(e) =>
                          changeRole.mutate({
                            id: u.id,
                            role: e.target.value as UserRole,
                          })
                        }
                      >
                        {USER_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="px-4 py-3 text-neutral-400">{u.city ?? '—'}</td>
                    <td className="px-4 py-3 text-right">
                      {!isMe && (
                        <button
                          className="rounded-md bg-neutral-800 px-2 py-1 text-neutral-400 hover:bg-red-600/20 hover:text-red-300"
                          title="Eliminar usuario"
                          aria-label="Eliminar usuario"
                          onClick={() =>
                            setConfirm({
                              title: 'Eliminar usuario',
                              danger: true,
                              confirmLabel: 'Eliminar',
                              message: (
                                <>
                                  ¿Eliminar a <b>{u.name}</b> ({u.email})? Se
                                  borrarán sus canciones personales, tags y
                                  playlists. El catálogo que haya creado se
                                  reasigna a ti.
                                </>
                              ),
                              onConfirm: () => remove.mutate(u.id),
                            })
                          }
                        >
                          🗑
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}
