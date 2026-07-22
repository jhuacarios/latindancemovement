'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type DanceStyle, type Tag } from '@baile-latino/types';
import { api, ApiError } from '@/lib/api';
import {
  ConfirmDialog,
  type ConfirmOptions,
} from '@/components/confirm-dialog';
import { Button, Card, DeleteIconButton, Input, Spinner } from '@/components/ui';

/** Color del punto indicador por estilo (acorde a los badges del catálogo). */
const STYLE_DOT: Record<DanceStyle, string> = {
  BACHATA: 'bg-amber-400',
  SALSA: 'bg-red-400',
};

export default function AdminTagsPage() {
  const qc = useQueryClient();
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
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
    mutationFn: (vars: { name: string; style: DanceStyle }) =>
      api<Tag>('/music/tags', {
        method: 'POST',
        body: { name: vars.name, style: vars.style },
      }),
    onSuccess: (_d, vars) => {
      setDrafts((p) => ({ ...p, [vars.style]: '' }));
      invalidate();
    },
    onError: (e) => setErr(e instanceof ApiError ? e.message : 'No se pudo crear'),
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

  const byStyle = (s: DanceStyle | null) =>
    (data ?? []).filter((t) => (t.style ?? null) === s);

  function startEdit(t: Tag) {
    setErr(null);
    setEditId(t.id);
    setEditName(t.name);
  }

  function askDelete(t: Tag) {
    setConfirm({
      title: 'Eliminar sub-estilo',
      danger: true,
      confirmLabel: 'Eliminar',
      message: (
        <>
          ¿Eliminar <b>{t.name}</b>? Se quitará de todas las canciones donde se
          usó{t.usageCount ? ` (${t.usageCount} usos)` : ''}.
        </>
      ),
      onConfirm: () => remove.mutate(t.id),
    });
  }

  // Render functions (NO componentes internos) para no remontar inputs y
  // perder el foco al tipear.
  const renderRow = (t: Tag) => {
    if (editId === t.id) {
      return (
        <li key={t.id} className="py-2">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="min-w-0 grow"
              value={editName}
              autoFocus
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && editName.trim())
                  update.mutate({ id: t.id, name: editName });
              }}
            />
            <Button
              disabled={!editName.trim() || update.isPending}
              onClick={() => update.mutate({ id: t.id, name: editName })}
            >
              Guardar
            </Button>
            <Button variant="ghost" onClick={() => setEditId(null)}>
              Cancelar
            </Button>
          </div>
        </li>
      );
    }
    return (
      <li key={t.id} className="flex items-center justify-between gap-2 py-2">
        <span className="min-w-0 truncate font-medium">{t.name}</span>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs text-neutral-500">{t.usageCount ?? 0} usos</span>
          <button
            className="rounded-md bg-neutral-800 px-2 py-1 hover:bg-neutral-700"
            title="Renombrar / mover"
            aria-label="Renombrar o mover"
            onClick={() => startEdit(t)}
          >
            ✏️
          </button>
          <DeleteIconButton
            title="Eliminar"
            aria-label="Eliminar"
            onClick={() => askDelete(t)}
          />
        </div>
      </li>
    );
  };

  const renderColumn = (style: DanceStyle, title: string) => {
    const tags = byStyle(style);
    const draft = drafts[style] ?? '';
    const submit = () => {
      if (!draft.trim()) return;
      setErr(null);
      create.mutate({ name: draft, style });
    };
    return (
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-semibold">
            <span className={`h-2.5 w-2.5 rounded-full ${STYLE_DOT[style]}`} />
            {title}
          </h2>
          <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400">
            {tags.length} sub-estilo{tags.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="mb-3 flex gap-2">
          <Input
            className="min-w-0 grow"
            placeholder={`Nuevo sub-estilo de ${title.toLowerCase()}…`}
            value={draft}
            onChange={(e) =>
              setDrafts((p) => ({ ...p, [style]: e.target.value }))
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
          />
          <Button disabled={!draft.trim() || create.isPending} onClick={submit}>
            + Agregar
          </Button>
        </div>

        <ul className="divide-y divide-neutral-800/60">
          {tags.map(renderRow)}
          {tags.length === 0 && (
            <li className="py-6 text-center text-sm text-neutral-500">
              Sin sub-estilos aún. Agrega el primero arriba.
            </li>
          )}
        </ul>
      </Card>
    );
  };

  const general = byStyle(null);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Estilos y sub-estilos</h1>
        <p className="text-sm text-neutral-400">
          Cada estilo agrupa sus sub-estilos. Crea, renombra o elimínalos en cada
          columna; los DJs asocian sus canciones a estos sub-estilos.
        </p>
      </div>

      {err && <p className="text-sm text-red-300">{err}</p>}
      {isLoading && <Spinner />}

      {data && (
        <>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {renderColumn('BACHATA', 'Bachata')}
            {renderColumn('SALSA', 'Salsa')}
          </div>

          {general.length > 0 && (
            <Card>
              <h2 className="font-semibold">Sin estilo (general)</h2>
              <p className="mb-3 text-xs text-neutral-400">
                Sub-estilos sin estilo asignado. Edítalos para moverlos a Bachata
                o Salsa.
              </p>
              <ul className="divide-y divide-neutral-800/60">
                {general.map(renderRow)}
              </ul>
            </Card>
          )}
        </>
      )}

      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}
