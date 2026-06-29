'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DuplicateGroup, Track } from '@baile-latino/types';
import { api, ApiError } from '@/lib/api';
import { Button, Spinner } from './ui';
import { usePlayer } from './player';
import { trackThumbUrl } from './track-thumb';
import { clsx } from './clsx';

function dur(sec: number | null): string {
  if (!sec) return '—';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Marca el título con etiquetas útiles para decidir (EN VIVO/DEMO/COVER = evitar). */
function detectFlags(title: string): { label: string; avoid: boolean }[] {
  const t = (title || '').toLowerCase();
  const out: { label: string; avoid: boolean }[] = [];
  if (/\b(en\s*vivo|live|directo|concierto)\b/.test(t))
    out.push({ label: 'EN VIVO', avoid: true });
  if (/\bdemo\b/.test(t)) out.push({ label: 'DEMO', avoid: true });
  if (/\bcover\b/.test(t)) out.push({ label: 'COVER', avoid: true });
  if (/\bremix\b/.test(t)) out.push({ label: 'REMIX', avoid: true });
  if (/\b(lyric|lyrics|letra)\b/.test(t))
    out.push({ label: 'LYRICS', avoid: false });
  if (/\baudio\b/.test(t)) out.push({ label: 'AUDIO', avoid: false });
  return out;
}

const avoidCount = (t: Track) =>
  detectFlags(t.title).filter((f) => f.avoid).length;

/** Mejor candidata por defecto: menos "evitar", y que tenga duración. */
function bestDefault(g: DuplicateGroup): Track {
  return [...g.tracks].sort(
    (a, b) =>
      avoidCount(a) - avoidCount(b) ||
      (a.durationSec ? 0 : 1) - (b.durationSec ? 0 : 1),
  )[0];
}

export function DuplicatesModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const player = usePlayer();
  const [keep, setKeep] = useState<Record<string, string>>({});
  const [resolved, setResolved] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['duplicates'],
    queryFn: () => api<DuplicateGroup[]>('/music/tracks/duplicates'),
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const merge = useMutation({
    mutationFn: (v: { key: string; keepId: string; removeIds: string[] }) =>
      api('/music/tracks/merge', {
        method: 'POST',
        body: { keepId: v.keepId, removeIds: v.removeIds },
      }),
    onSuccess: (_d, v) => {
      setResolved((p) => new Set(p).add(v.key));
      void qc.invalidateQueries({ queryKey: ['catalog'] });
      void qc.invalidateQueries({ queryKey: ['catalog-summary'] });
    },
    onError: (e) =>
      setErr(e instanceof ApiError ? e.message : 'No se pudo resolver.'),
  });

  const groups = (data ?? []).filter((g) => !resolved.has(g.key));
  const chosenId = (g: DuplicateGroup) => keep[g.key] ?? bestDefault(g).id;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-3xl flex-col rounded-xl border border-neutral-800 bg-neutral-900 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">🔎 Posibles duplicados en el catálogo</h2>
          <button
            onClick={onClose}
            className="rounded-lg bg-neutral-800 px-2 py-1 text-sm hover:bg-neutral-700"
          >
            ✕
          </button>
        </div>

        <p className="text-xs text-neutral-500">
          Misma canción en varios videos (audio, en vivo, demos…). Elige cuál
          conservar; las otras se eliminan y sus referencias (playlists, Mis
          Canciones) se reasignan a la elegida. ▶ para comparar.
        </p>

        {err && <p className="mt-3 text-sm text-red-300">{err}</p>}

        {isLoading && (
          <div className="mt-4">
            <Spinner label="Buscando duplicados…" />
          </div>
        )}

        {!isLoading && groups.length === 0 && (
          <p className="mt-6 rounded-lg border border-neutral-800 bg-neutral-800/40 px-3 py-6 text-center text-sm text-neutral-400">
            {(data?.length ?? 0) > 0
              ? '✓ ¡Listo! No quedan duplicados por resolver.'
              : 'No se encontraron posibles duplicados.'}
          </p>
        )}

        <div className="mt-3 flex-1 space-y-4 overflow-auto">
          {groups.map((g) => {
            const sel = chosenId(g);
            const removeIds = g.tracks.map((t) => t.id).filter((x) => x !== sel);
            return (
              <div
                key={g.key}
                className="rounded-lg border border-neutral-800 p-2"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {g.tracks[0].title} ·{' '}
                    <span className="text-neutral-400">{g.tracks[0].artist}</span>
                  </span>
                  <Button
                    disabled={merge.isPending || removeIds.length === 0}
                    onClick={() =>
                      merge.mutate({ key: g.key, keepId: sel, removeIds })
                    }
                  >
                    Conservar elegida · eliminar {removeIds.length}
                  </Button>
                </div>

                <div className="space-y-1">
                  {g.tracks.map((t) => {
                    const url = trackThumbUrl(t);
                    const isKeep = sel === t.id;
                    const playing =
                      player.playingKey === `${t.source}:${t.sourceId}`;
                    const flags = detectFlags(t.title);
                    return (
                      <label
                        key={t.id}
                        className={clsx(
                          'flex cursor-pointer items-center gap-2 rounded-lg border p-1.5 transition',
                          isKeep
                            ? 'border-clave/50 bg-clave/10'
                            : 'border-transparent hover:bg-neutral-800/50',
                        )}
                      >
                        <input
                          type="radio"
                          name={`keep-${g.key}`}
                          checked={isKeep}
                          onChange={() =>
                            setKeep((p) => ({ ...p, [g.key]: t.id }))
                          }
                          className="accent-[var(--color-clave)]"
                        />
                        {url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={url}
                            alt=""
                            loading="lazy"
                            className="aspect-video w-12 shrink-0 rounded bg-neutral-800 object-cover"
                          />
                        ) : (
                          <div className="aspect-video w-12 shrink-0 rounded bg-neutral-800" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-medium">
                            {t.title}
                          </div>
                          <div className="flex flex-wrap items-center gap-1 text-[10px] text-neutral-500">
                            {dur(t.durationSec)} · {t.year ?? '—'}
                            {flags.map((f) => (
                              <span
                                key={f.label}
                                className={clsx(
                                  'rounded px-1 py-0.5',
                                  f.avoid
                                    ? 'bg-red-500/15 text-red-300'
                                    : 'bg-neutral-700/50 text-neutral-300',
                                )}
                              >
                                {f.label}
                              </span>
                            ))}
                            {isKeep && (
                              <span className="text-clave">· se conserva</span>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          title="Reproducir"
                          onClick={(e) => {
                            e.preventDefault();
                            if (player.canPlay(t)) player.playAudio(t);
                          }}
                          className={clsx(
                            'shrink-0 rounded-md px-2 py-1 text-sm transition',
                            playing
                              ? 'bg-brand/20 text-brand'
                              : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100',
                          )}
                        >
                          ▶
                        </button>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex justify-end">
          <Button variant="ghost" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </div>
    </div>
  );
}
