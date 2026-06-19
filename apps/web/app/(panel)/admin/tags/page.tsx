'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DANCE_STYLES,
  type DanceStyle,
  type Tag,
} from '@baile-latino/types';
import { api, ApiError } from '@/lib/api';
import {
  ConfirmDialog,
  type ConfirmOptions,
} from '@/components/confirm-dialog';
import { Button, Card, Input, Select, Spinner } from '@/components/ui';

export default function AdminTagsPage() {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [style, setStyle] = useState<'' | DanceStyle>('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['tags-vocab'],
    queryFn: () => api<Tag[]>('/music/tags'),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['tags-vocab'] });
  };

  const create = useMutation({
    mutationFn: () =>
      api<Tag>('/music/tags', {
        method: 'POST',
        body: { name, style: style || undefined },
      }),
    onSuccess: () => {
      setName('');
      setStyle('');
      invalidate();
    },
    onError: (e) =>
      setErr(e instanceof ApiError ? e.message : 'No se pudo crear'),
  });

  const update = useMutation({
    mutationFn: (vars: { id: string; name?: string; style?: DanceStyle | null }) =>
      api(`/music/tags/${vars.id}`, {
        method: 'PATCH',
        body: { name: vars.name, style: vars.style },
      }),
    onSuccess: () => {
      setEditId(null);
      invalidate();
    },
    onError: (e) =>
      setErr(e instanceof ApiError ? e.message : 'No se pudo actualizar'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/music/tags/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Estilos y sub-estilos</h1>
        <p className="text-sm text-neutral-400">
          Vocabulario de tags. Cada tag se crea una sola vez (sin distinguir
          mayúsculas ni puntuación); los DJs asocian sus canciones a estos tags.
        </p>
      </div>

      <Card>
        <h2 className="mb-3 font-semibold">Nuevo tag</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="grow">
            <label className="mb-1 block text-xs text-neutral-400">Nombre</label>
            <Input
              placeholder="Ej: Sensual, On2, Mambo…"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && name.trim()) create.mutate();
              }}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-400">
              Estilo (opcional)
            </label>
            <Select
              value={style}
              onChange={(e) => setStyle(e.target.value as '' | DanceStyle)}
            >
              <option value="">— General</option>
              {DANCE_STYLES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </div>
          <Button
            disabled={!name.trim() || create.isPending}
            onClick={() => {
              setErr(null);
              create.mutate();
            }}
          >
            {create.isPending ? 'Creando…' : '+ Crear'}
          </Button>
        </div>
        {err && <p className="mt-3 text-sm text-red-300">{err}</p>}
      </Card>

      {isLoading && <Spinner />}

      {data && (
        <Card className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-800 text-left text-neutral-400">
              <tr>
                <th className="px-4 py-3">Tag</th>
                <th className="px-4 py-3 w-40">Estilo</th>
                <th className="px-4 py-3 w-20">Usos</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {data.map((t) => (
                <tr key={t.id} className="border-b border-neutral-800/60 last:border-0">
                  <td className="px-4 py-3">
                    {editId === t.id ? (
                      <div className="flex gap-2">
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          autoFocus
                        />
                        <Button
                          onClick={() =>
                            update.mutate({ id: t.id, name: editName })
                          }
                        >
                          Guardar
                        </Button>
                        <Button variant="ghost" onClick={() => setEditId(null)}>
                          Cancelar
                        </Button>
                      </div>
                    ) : (
                      <span className="font-medium">{t.name}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Select
                      value={t.style ?? ''}
                      onChange={(e) =>
                        update.mutate({
                          id: t.id,
                          style: (e.target.value || null) as DanceStyle | null,
                        })
                      }
                    >
                      <option value="">— General</option>
                      {DANCE_STYLES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="px-4 py-3 text-neutral-400">{t.usageCount ?? 0}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        className="rounded-md bg-neutral-800 px-2 py-1 hover:bg-neutral-700"
                        title="Renombrar"
                        aria-label="Renombrar"
                        onClick={() => {
                          setEditId(t.id);
                          setEditName(t.name);
                        }}
                      >
                        ✏️
                      </button>
                      <button
                        className="rounded-md bg-neutral-800 px-2 py-1 text-neutral-400 hover:bg-red-600/20 hover:text-red-300"
                        title="Eliminar"
                        aria-label="Eliminar"
                        onClick={() =>
                          setConfirm({
                            title: 'Eliminar tag',
                            danger: true,
                            confirmLabel: 'Eliminar',
                            message: (
                              <>
                                ¿Eliminar el tag <b>{t.name}</b>? Se quitará de
                                todas las canciones donde se usó
                                {t.usageCount ? ` (${t.usageCount} usos)` : ''}.
                              </>
                            ),
                            onConfirm: () => remove.mutate(t.id),
                          })
                        }
                      >
                        🗑
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-neutral-500">
                    Sin tags aún. Crea el primero arriba.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}
