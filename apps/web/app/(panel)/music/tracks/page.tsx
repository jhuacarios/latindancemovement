'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DANCE_STYLES,
  type Paginated,
  type Track,
} from '@baile-latino/types';
import { api } from '@/lib/api';
import { AddTrackForm, type NewTrackBody } from '@/components/add-track-form';
import { usePlayer } from '@/components/player';
import { SourceLink } from '@/components/source-link';
import {
  ConfirmDialog,
  type ConfirmOptions,
} from '@/components/confirm-dialog';
import { useAuth } from '@/lib/auth';
import { usePermissions } from '@/lib/permissions';
import { Button, Card, Input, Select, Spinner, StyleBadge } from '@/components/ui';

const PAGE_SIZE = 20;

export default function MyTracksPage() {
  const qc = useQueryClient();
  const player = usePlayer();
  const { user } = useAuth();
  const perms = usePermissions();
  const canEdit = user ? perms.can(user.role, 'music', 'editar') : false;
  const canDelete = user ? perms.can(user.role, 'music', 'eliminar') : false;
  const [search, setSearch] = useState('');
  const [style, setStyle] = useState('');
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null);

  function toggleSel(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function exitSelect() {
    setSelectMode(false);
    setSelected(new Set());
  }

  const { data, isLoading, error } = useQuery({
    queryKey: ['library', { search, style, page }],
    queryFn: () => {
      const p = new URLSearchParams();
      if (search) p.set('search', search);
      if (style) p.set('style', style);
      p.set('page', String(page));
      p.set('pageSize', String(PAGE_SIZE));
      return api<Paginated<Track>>(`/music/library?${p.toString()}`);
    },
  });

  const remove = useMutation({
    mutationFn: (trackId: string) =>
      api(`/music/library/${trackId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['library'] });
      void qc.invalidateQueries({ queryKey: ['catalog'] });
    },
  });

  const bulkRemove = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(
        ids.map((id) => api(`/music/library/${id}`, { method: 'DELETE' })),
      );
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['library'] });
      void qc.invalidateQueries({ queryKey: ['catalog'] });
      exitSelect();
    },
  });

  const pageIds = data?.data.map((t) => t.id) ?? [];
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Mis Canciones</h1>
          <p className="text-sm text-neutral-400">
            {data ? `${data.total} en tu selección` : ' '} ·{' '}
            <Link href="/music/catalog" className="text-brand hover:underline">
              elegir del catálogo →
            </Link>
          </p>
        </div>
        <div className="flex gap-2">
          {canDelete && (
            <Button
              variant="ghost"
              onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
            >
              {selectMode ? 'Cancelar selección' : '☑ Seleccionar'}
            </Button>
          )}
          {canEdit && (
            <Button onClick={() => setShowForm((s) => !s)}>
              {showForm ? 'Cerrar' : '+ Agregar mi música'}
            </Button>
          )}
        </div>
      </div>

      {selectMode && (
        <Card className="flex items-center justify-between">
          <span className="text-sm text-neutral-300">
            {selected.size} seleccionada{selected.size === 1 ? '' : 's'}
          </span>
          <Button
            variant="danger"
            disabled={selected.size === 0 || bulkRemove.isPending}
            onClick={() =>
              setConfirm({
                title: 'Quitar seleccionadas',
                danger: true,
                confirmLabel: `Quitar ${selected.size}`,
                message: (
                  <>
                    ¿Quitar {selected.size} canción
                    {selected.size === 1 ? '' : 'es'} de tu selección? Las
                    personales se eliminarán por completo.
                  </>
                ),
                onConfirm: () => bulkRemove.mutate(Array.from(selected)),
              })
            }
          >
            {bulkRemove.isPending
              ? 'Quitando…'
              : `Quitar seleccionadas (${selected.size})`}
          </Button>
        </Card>
      )}

      {showForm && (
        <AddTrackForm
          title="Agregar mi música (privada)"
          submitLabel="Guardar en mis canciones"
          onCreate={(body: NewTrackBody) =>
            api('/music/library/personal', { method: 'POST', body })
          }
          onDone={() => {
            setShowForm(false);
            void qc.invalidateQueries({ queryKey: ['library'] });
          }}
        />
      )}

      <Card className="flex flex-wrap items-end gap-3">
        <div className="grow">
          <label className="mb-1 block text-xs text-neutral-400">Buscar</label>
          <Input
            placeholder="Título o artista…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-neutral-400">Estilo</label>
          <Select
            value={style}
            onChange={(e) => {
              setStyle(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {DANCE_STYLES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      {isLoading && <Spinner />}
      {error && <p className="text-sm text-red-300">No se pudieron cargar tus canciones.</p>}

      {data && (
        <Card className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-800 text-left text-neutral-400">
              <tr>
                {selectMode && (
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      className="accent-[var(--color-brand)]"
                      checked={allSelected}
                      onChange={toggleAll}
                      title="Seleccionar todo"
                    />
                  </th>
                )}
                <th className="px-4 py-3">Título</th>
                <th className="px-4 py-3">Artista</th>
                <th className="px-4 py-3">Estilo</th>
                <th className="px-4 py-3">Origen</th>
                <th className="px-4 py-3">BPM</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((t) => (
                <tr
                  key={t.id}
                  className={
                    'border-b border-neutral-800/60 last:border-0 ' +
                    (selected.has(t.id) ? 'bg-brand/5' : '')
                  }
                >
                  {selectMode && (
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        className="accent-[var(--color-brand)]"
                        checked={selected.has(t.id)}
                        onChange={() => toggleSel(t.id)}
                      />
                    </td>
                  )}
                  <td className="px-4 py-3 font-medium">{t.title}</td>
                  <td className="px-4 py-3 text-neutral-300">{t.artist}</td>
                  <td className="px-4 py-3">
                    <StyleBadge style={t.substyle ?? t.style} />
                  </td>
                  <td className="px-4 py-3">
                    {t.scope === 'PERSONAL' ? (
                      <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-xs text-violet-300">
                        personal
                      </span>
                    ) : (
                      <span className="rounded-full bg-neutral-700/40 px-2 py-0.5 text-xs text-neutral-400">
                        catálogo
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-neutral-400">{t.bpm ?? '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {player.canPlay(t) && (
                        <>
                          <button
                            className="rounded-md bg-neutral-800 px-2 py-1 hover:bg-neutral-700"
                            title="Reproducir audio"
                            onClick={() => player.playAudio(t)}
                          >
                            🎵
                          </button>
                          <button
                            className="rounded-md bg-neutral-800 px-2 py-1 hover:bg-neutral-700"
                            title="Reproducir video"
                            onClick={() => player.playVideo(t)}
                          >
                            🎬
                          </button>
                        </>
                      )}
                      <SourceLink track={t} />
                      {canDelete && (
                      <button
                        className="rounded-md bg-neutral-800 px-2 py-1 text-neutral-400 hover:bg-red-600/20 hover:text-red-300"
                        onClick={() =>
                          setConfirm({
                            title: 'Quitar canción',
                            danger: true,
                            confirmLabel: 'Quitar',
                            message: (
                              <>
                                ¿Quitar <b>{t.title}</b> de tus canciones?
                                <br />
                                {t.scope === 'PERSONAL'
                                  ? 'Es una canción personal: se eliminará por completo.'
                                  : 'Se quitará de tu selección (seguirá en el catálogo).'}
                              </>
                            ),
                            onConfirm: () => remove.mutate(t.id),
                          })
                        }
                        title="Quitar de mis canciones"
                        aria-label="Quitar de mis canciones"
                      >
                        🗑
                      </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {data.data.length === 0 && (
                <tr>
                  <td
                    colSpan={selectMode ? 7 : 6}
                    className="px-4 py-10 text-center text-neutral-500"
                  >
                    Aún no tienes canciones. Agrega tu música o{' '}
                    <Link href="/music/catalog" className="text-brand hover:underline">
                      elige del catálogo
                    </Link>
                    .
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      {data && data.total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm">
          <Button variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            ← Anterior
          </Button>
          <span className="text-neutral-400">
            Página {page} de {totalPages}
          </span>
          <Button
            variant="ghost"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Siguiente →
          </Button>
        </div>
      )}

      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}
