'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Tag,
  TrackTagsResponse,
} from '@baile-latino/types';
import { api, ApiError } from '@/lib/api';
import { Button, Input, Spinner } from './ui';
import { clsx } from './clsx';

export function TagEditor({
  trackId,
  title,
  style,
  onClose,
}: {
  trackId: string;
  title: string;
  /** Estilo principal de la canción: solo se muestran/crean tags de ese estilo. */
  style: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  const trackTags = useQuery({
    queryKey: ['track-tags', trackId],
    queryFn: () => api<TrackTagsResponse>(`/music/tracks/${trackId}/tags`),
  });
  const vocab = useQuery({
    queryKey: ['tags-vocab'],
    queryFn: () => api<Tag[]>('/music/tags'),
  });

  useEffect(() => {
    if (trackTags.data && !initialized) {
      setSelected(new Set(trackTags.data.mine));
      setInitialized(true);
    }
  }, [trackTags.data, initialized]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const createTag = useMutation({
    mutationFn: (name: string) =>
      api<Tag>('/music/tags', { method: 'POST', body: { name, style } }),
    onSuccess: (tag) => {
      setSelected((prev) => new Set(prev).add(tag.id));
      setQuery('');
      void qc.invalidateQueries({ queryKey: ['tags-vocab'] });
    },
    onError: (e) =>
      setErr(e instanceof ApiError ? e.message : 'No se pudo crear el tag'),
  });

  const save = useMutation({
    mutationFn: () =>
      api(`/music/tracks/${trackId}/tags`, {
        method: 'PUT',
        body: { tagIds: Array.from(selected) },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['library'] });
      void qc.invalidateQueries({ queryKey: ['track-tags', trackId] });
      onClose();
    },
    onError: (e) =>
      setErr(e instanceof ApiError ? e.message : 'No se pudo guardar'),
  });

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Solo sugerencias del estilo principal de la canción.
  const suggestions = (trackTags.data?.suggestions ?? []).filter(
    (s) => s.style === style,
  );
  const suggestionIds = new Set(suggestions.map((s) => s.id));

  // Resto del vocabulario del MISMO estilo (sin las sugerencias), filtrado por búsqueda.
  const others = useMemo(() => {
    const all = vocab.data ?? [];
    const q = query.trim().toLowerCase();
    return all
      .filter((t) => t.style === style)
      .filter((t) => !suggestionIds.has(t.id))
      .filter((t) => !q || t.name.toLowerCase().includes(q));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vocab.data, query, trackTags.data, style]);

  const exactExists =
    (vocab.data ?? []).some(
      (t) =>
        t.style === style &&
        t.name.toLowerCase() === query.trim().toLowerCase(),
    ) || query.trim() === '';

  const loading = trackTags.isLoading || vocab.isLoading;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-neutral-800 bg-neutral-900 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <div className="mb-1 flex items-center justify-between">
            <h2 className="font-semibold">🏷 Tags de la canción</h2>
            <button
              onClick={onClose}
              className="rounded-lg bg-neutral-800 px-2 py-1 text-sm hover:bg-neutral-700"
            >
              ✕
            </button>
          </div>
          <p className="mb-4 truncate text-sm text-neutral-400">{title}</p>

          {loading && <Spinner />}

          {!loading && (
            <>
              {suggestions.length > 0 && (
                <div className="mb-4">
                  <div className="mb-2 text-xs uppercase tracking-wide text-neutral-500">
                    Sugeridos para esta canción (más usados primero)
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {suggestions.map((s) => (
                      <Chip
                        key={s.id}
                        label={`${s.name} · ${s.count}`}
                        active={selected.has(s.id)}
                        onClick={() => toggle(s.id)}
                      />
                    ))}
                  </div>
                </div>
              )}

              <div className="mb-2 text-xs uppercase tracking-wide text-neutral-500">
                Vocabulario
              </div>
              <Input
                placeholder="Buscar o crear tag…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && query.trim() && !exactExists) {
                    e.preventDefault();
                    createTag.mutate(query.trim());
                  }
                }}
              />

              {query.trim() && !exactExists && (
                <button
                  className="mt-2 text-sm text-brand hover:underline"
                  onClick={() => createTag.mutate(query.trim())}
                  disabled={createTag.isPending}
                >
                  + Crear tag «{query.trim()}»
                </button>
              )}

              <div className="mt-3 flex max-h-48 flex-wrap gap-2 overflow-auto">
                {others.map((t) => (
                  <Chip
                    key={t.id}
                    label={t.name}
                    active={selected.has(t.id)}
                    onClick={() => toggle(t.id)}
                  />
                ))}
                {others.length === 0 && (
                  <span className="text-sm text-neutral-500">
                    Sin más tags. Escribe arriba para crear uno.
                  </span>
                )}
              </div>

              {err && <p className="mt-3 text-sm text-red-300">{err}</p>}

              <div className="mt-5 flex items-center justify-between">
                <span className="text-sm text-neutral-400">
                  {selected.size} seleccionado{selected.size === 1 ? '' : 's'}
                </span>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={onClose}>
                    Cancelar
                  </Button>
                  <Button disabled={save.isPending} onClick={() => save.mutate()}>
                    {save.isPending ? 'Guardando…' : 'Guardar'}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'rounded-full px-3 py-1 text-sm transition',
        active
          ? 'bg-brand text-white'
          : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700',
      )}
    >
      {label}
    </button>
  );
}
