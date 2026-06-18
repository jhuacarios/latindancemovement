'use client';

import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DANCE_STYLES,
  TRACK_SOURCES,
  type ExcelImportResult,
  type Paginated,
  type Track,
} from '@baile-latino/types';
import { api, ApiError, downloadFile, uploadFile } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { AddTrackForm, type NewTrackBody } from '@/components/add-track-form';
import { usePlayer } from '@/components/player';
import { SourceLink } from '@/components/source-link';
import { Button, Card, Input, Select, Spinner, StyleBadge } from '@/components/ui';

const PAGE_SIZE = 20;

export default function CatalogPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const player = usePlayer();
  const isAdmin = user?.role === 'SUPER_ADMIN';

  const [search, setSearch] = useState('');
  const [style, setStyle] = useState('');
  const [source, setSource] = useState('');
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

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
    queryKey: ['catalog', { search, style, source, page }],
    queryFn: () => {
      const p = new URLSearchParams();
      if (search) p.set('search', search);
      if (style) p.set('style', style);
      if (source) p.set('source', source);
      p.set('page', String(page));
      p.set('pageSize', String(PAGE_SIZE));
      return api<Paginated<Track>>(`/music/tracks?${p.toString()}`);
    },
  });

  const toggle = useMutation({
    mutationFn: (t: Track) =>
      t.inLibrary
        ? api(`/music/library/${t.id}`, { method: 'DELETE' })
        : api('/music/library', { method: 'POST', body: { trackId: t.id } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['catalog'] });
      void qc.invalidateQueries({ queryKey: ['library'] });
    },
  });

  const bulkAdd = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(
        ids.map((id) =>
          api('/music/library', { method: 'POST', body: { trackId: id } }),
        ),
      );
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['catalog'] });
      void qc.invalidateQueries({ queryKey: ['library'] });
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
          <h1 className="text-2xl font-bold">📚 Catálogo</h1>
          <p className="text-sm text-neutral-400">
            {data ? `${data.total} canciones en la base` : ' '}
            {!isAdmin && ' · agrégalas a Mis Canciones'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
          >
            {selectMode ? 'Cancelar selección' : '☑ Seleccionar'}
          </Button>
          {isAdmin && (
            <Button onClick={() => setShowForm((s) => !s)}>
              {showForm ? 'Cerrar' : '+ Nueva canción al catálogo'}
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
            disabled={selected.size === 0 || bulkAdd.isPending}
            onClick={() => bulkAdd.mutate(Array.from(selected))}
          >
            {bulkAdd.isPending
              ? 'Agregando…'
              : `➕ Agregar seleccionadas a mis canciones (${selected.size})`}
          </Button>
        </Card>
      )}

      {isAdmin && showForm && (
        <AddTrackForm
          title="Nueva canción al catálogo global"
          submitLabel="Agregar al catálogo"
          onCreate={(body: NewTrackBody) =>
            api('/music/tracks', { method: 'POST', body })
          }
          onDone={() => {
            setShowForm(false);
            void qc.invalidateQueries({ queryKey: ['catalog'] });
            void qc.invalidateQueries({ queryKey: ['catalog-summary'] });
          }}
        />
      )}

      {isAdmin && <AdminImportExport />}

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
        <div>
          <label className="mb-1 block text-xs text-neutral-400">Fuente</label>
          <Select
            value={source}
            onChange={(e) => {
              setSource(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todas</option>
            {TRACK_SOURCES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      {isLoading && <Spinner />}
      {error && <p className="text-sm text-red-300">No se pudo cargar el catálogo.</p>}

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
                      <button
                        className={
                          t.inLibrary
                            ? 'rounded-lg bg-emerald-500/15 px-2 py-1 text-xs text-emerald-300'
                            : 'rounded-lg bg-brand/15 px-2 py-1 text-xs text-brand hover:bg-brand/25'
                        }
                        disabled={toggle.isPending}
                        onClick={() => toggle.mutate(t)}
                      >
                        {t.inLibrary ? '✓ En mis canciones' : '➕ Agregar'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {data.data.length === 0 && (
                <tr>
                  <td
                    colSpan={selectMode ? 6 : 5}
                    className="px-4 py-10 text-center text-neutral-500"
                  >
                    El catálogo está vacío.
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
    </div>
  );
}

/** Import/export del catálogo global (solo admin). */
function AdminImportExport() {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ExcelImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File) {
    setError(null);
    setResult(null);
    setUploading(true);
    try {
      const res = await uploadFile<ExcelImportResult>(
        '/music/tracks/import-excel',
        file,
      );
      setResult(res);
      void qc.invalidateQueries({ queryKey: ['catalog'] });
      void qc.invalidateQueries({ queryKey: ['catalog-summary'] });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo importar');
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-2 text-sm font-semibold">Gestión del catálogo:</span>
        <Button
          variant="ghost"
          onClick={() =>
            downloadFile('/music/tracks/template.xlsx', 'plantilla-canciones.xlsx')
          }
        >
          ⬇ Plantilla
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
            e.target.value = '';
          }}
        />
        <Button disabled={uploading} onClick={() => inputRef.current?.click()}>
          {uploading ? 'Importando…' : '⬆ Importar Excel'}
        </Button>
        <Button
          variant="ghost"
          onClick={() => downloadFile('/music/tracks/export.xlsx', 'canciones.xlsx')}
        >
          ⬇ Exportar
        </Button>
      </div>

      {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
      {result && (
        <p className="mt-3 text-sm text-neutral-300">
          Filas: {result.totalRows} · creadas {result.created} · actualizadas{' '}
          {result.updated} · errores {result.errors.length}
        </p>
      )}
    </Card>
  );
}
