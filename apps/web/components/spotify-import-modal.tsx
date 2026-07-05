'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  type DanceStyle,
  type ExtractedTrackMetadata,
  type MatchConfidence,
  type PlaylistImportResult,
  type SpotifyImportMatch,
  type Track,
} from '@baile-latino/types';
import { api, ApiError } from '@/lib/api';
import { Button, Input, Spinner } from './ui';
import { InlineAudioPlayer } from './player';
import { trackThumbUrl } from './track-thumb';
import { clsx } from './clsx';

function fmtDur(sec: number | null): string {
  if (!sec) return '—';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const CONF: Record<MatchConfidence, { label: string; cls: string }> = {
  high: { label: '🟢 alta', cls: 'text-clave' },
  medium: { label: '🟡 media', cls: 'text-amber-300' },
  low: { label: '🔴 revisar', cls: 'text-red-300' },
  none: { label: '— sin match', cls: 'text-neutral-500' },
};

/**
 * Importa una playlist de Spotify al catálogo, matcheando cada canción con el
 * mejor video de YouTube (audio limpio para social). Solo SUPER_ADMIN.
 */
export function SpotifyImportModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [link, setLink] = useState('');
  const [matches, setMatches] = useState<SpotifyImportMatch[] | null>(null);
  /** Índice del candidato elegido por fila (0 = mejor). */
  const [pick, setPick] = useState<Record<number, number>>({});
  /** Estilo elegido por fila (vacío = se omite). */
  const [styleByRow, setStyleByRow] = useState<Record<number, DanceStyle>>({});
  const [nowPlaying, setNowPlaying] = useState<ExtractedTrackMetadata | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<PlaylistImportResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  /** Candidato actualmente elegido para una fila. */
  function chosen(m: SpotifyImportMatch, i: number): ExtractedTrackMetadata | null {
    return m.candidates[pick[i] ?? 0] ?? m.best;
  }

  async function preview() {
    if (!link.trim()) {
      setErr('Pega el link de una playlist pública de Spotify.');
      return;
    }
    setErr(null);
    setResult(null);
    setMatches(null);
    setNowPlaying(null);
    setLoading(true);
    try {
      const res = await api<SpotifyImportMatch[]>('/music/tracks/spotify-preview', {
        method: 'POST',
        body: { link },
      });
      setMatches(res);
      // Estilo inicial: el detectado del mejor candidato (si lo hay).
      const st: Record<number, DanceStyle> = {};
      res.forEach((m, i) => {
        if (m.best?.detectedStyle) st[i] = m.best.detectedStyle;
      });
      setStyleByRow(st);
      setPick({});
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'No se pudo leer la playlist.');
    } finally {
      setLoading(false);
    }
  }

  function setStyle(i: number, s: DanceStyle) {
    setStyleByRow((prev) => {
      const next = { ...prev };
      if (next[i] === s) delete next[i]; // re-clic: deselecciona (omite la fila)
      else next[i] = s;
      return next;
    });
  }

  // Filas que fallaron por cuota de YouTube agotada (no por falta de match).
  const quotaCount = matches?.filter((m) => m.quotaError).length ?? 0;

  // Selecciones finales: filas con candidato + estilo.
  const selections =
    matches?.flatMap((m, i) => {
      const cand = chosen(m, i);
      const st = styleByRow[i];
      return cand && st ? [{ sourceId: cand.sourceId, style: st }] : [];
    }) ?? [];

  async function save() {
    setErr(null);
    setSaving(true);
    try {
      const res = await api<PlaylistImportResult>('/music/tracks/spotify-import', {
        method: 'POST',
        body: { selections },
      });
      setResult(res);
      void qc.invalidateQueries({ queryKey: ['catalog'] });
      void qc.invalidateQueries({ queryKey: ['catalog-summary'] });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'No se pudo importar.');
    } finally {
      setSaving(false);
    }
  }

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
          <h2 className="font-semibold">🟢 Importar playlist de Spotify</h2>
          <button
            onClick={onClose}
            className="rounded-lg bg-neutral-800 px-2 py-1 text-sm hover:bg-neutral-700"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="grow">
            <label className="mb-1 block text-xs text-neutral-400">
              Link de la playlist pública de Spotify
            </label>
            <Input
              placeholder="https://open.spotify.com/playlist/…"
              value={link}
              onChange={(e) => setLink(e.target.value)}
            />
          </div>
          <Button variant="ghost" disabled={loading} onClick={preview}>
            {loading ? 'Buscando…' : 'Cargar'}
          </Button>
        </div>

        <p className="mt-2 text-[11px] text-neutral-500">
          Por cada canción se busca el mejor video de YouTube (audio limpio para
          social). Puede tardar un poco y consume cuota de YouTube.
        </p>

        {err &&
          (/no es p[úu]blica|vac[íi]a/i.test(err) ? (
            <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200/90">
              ⚠️ No se pudo leer la playlist. Debe ser <strong>pública</strong> y
              un link válido de Spotify.
            </p>
          ) : (
            <p className="mt-3 text-sm text-red-300">{err}</p>
          ))}

        {loading && (
          <div className="mt-4">
            <Spinner label="Buscando coincidencias en YouTube…" />
          </div>
        )}

        {matches && !result && (
          <>
            <div className="mt-4 text-sm text-neutral-400">
              {matches.length} canciones · {selections.length} listas para importar
              {matches.length - selections.length > 0 && (
                <span className="ml-2 text-amber-300/90">
                  · {matches.length - selections.length} sin estilo/sin match
                  (elige para incluir)
                </span>
              )}
            </div>

            {quotaCount > 0 && (
              <p className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200/90">
                ⚠️ <strong>Cuota de YouTube agotada:</strong> {quotaCount}{' '}
                {quotaCount === 1 ? 'canción no se pudo' : 'canciones no se pudieron'}{' '}
                buscar (aparecen como “Cuota agotada”, <strong>no</strong> es que
                no tengan match). Reintenta después de medianoche hora del
                Pacífico (~01:00–02:00 en Chile) o con otra API key.
              </p>
            )}

            {nowPlaying && (
              <div className="mt-3">
                <InlineAudioPlayer
                  key={nowPlaying.sourceId}
                  track={nowPlaying as unknown as Track}
                  onClose={() => setNowPlaying(null)}
                />
              </div>
            )}

            <div className="mt-3 flex-1 overflow-auto rounded-lg border border-neutral-800">
              <table className="w-full text-sm">
                <thead className="sticky top-0 border-b border-neutral-800 bg-neutral-900 text-left text-neutral-400">
                  <tr>
                    <th className="w-14 px-2 py-2"></th>
                    <th className="px-3 py-2">Canción (Spotify)</th>
                    <th className="px-3 py-2">Match en YouTube</th>
                    <th className="w-10 px-2 py-2"></th>
                    <th className="px-3 py-2">Estilo</th>
                  </tr>
                </thead>
                <tbody>
                  {matches.map((m, i) => {
                    const cand = chosen(m, i);
                    const url = cand
                      ? trackThumbUrl(cand as unknown as Track)
                      : null;
                    const playing =
                      !!cand && nowPlaying?.sourceId === cand.sourceId;
                    const value = styleByRow[i];
                    const conf = CONF[m.confidence];
                    return (
                      <tr
                        key={i}
                        className="border-b border-neutral-800/60 last:border-0 align-top"
                      >
                        <td className="px-2 py-2">
                          {url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={url}
                              alt=""
                              loading="lazy"
                              className="aspect-video w-12 rounded bg-neutral-800 object-cover"
                            />
                          ) : (
                            <div className="aspect-video w-12 rounded bg-neutral-800" />
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-medium">{m.spotify.title}</div>
                          <div className="text-xs text-neutral-400">
                            {m.spotify.artist ?? '—'} · {fmtDur(m.spotify.durationSec)}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          {cand ? (
                            <>
                              <div className="truncate text-xs">
                                {cand.title}
                              </div>
                              <div className="text-[11px] text-neutral-500">
                                {cand.channelTitle ?? '—'} ·{' '}
                                {fmtDur(cand.durationSec)} ·{' '}
                                <span className={conf.cls}>{conf.label}</span>
                              </div>
                              {m.candidates.length > 1 && (
                                <select
                                  value={pick[i] ?? 0}
                                  onChange={(e) =>
                                    setPick((p) => ({
                                      ...p,
                                      [i]: Number(e.target.value),
                                    }))
                                  }
                                  className="mt-1 max-w-full rounded border border-neutral-700 bg-neutral-800 px-1 py-0.5 text-[11px] text-neutral-300"
                                >
                                  {m.candidates.map((c, ci) => (
                                    <option key={c.sourceId} value={ci}>
                                      {fmtDur(c.durationSec)} · {c.channelTitle} ·{' '}
                                      {c.title.slice(0, 40)}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </>
                          ) : m.quotaError ? (
                            <span className="text-xs text-amber-300/90">
                              ⚠️ Cuota agotada
                            </span>
                          ) : (
                            <span className="text-xs text-neutral-500">
                              Sin resultados
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          {cand && (
                            <button
                              type="button"
                              title={playing ? 'Detener' : 'Reproducir'}
                              onClick={() =>
                                setNowPlaying(playing ? null : cand)
                              }
                              className={clsx(
                                'rounded-md px-2 py-1 text-sm transition',
                                playing
                                  ? 'bg-brand/20 text-brand'
                                  : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100',
                              )}
                            >
                              {playing ? '⏸' : '▶'}
                            </button>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="inline-flex gap-1 rounded-lg bg-neutral-800/60 p-0.5">
                            {(['BACHATA', 'SALSA'] as const).map((s) => {
                              const active = value === s;
                              return (
                                <button
                                  key={s}
                                  type="button"
                                  disabled={!cand}
                                  onClick={() => setStyle(i, s)}
                                  className={clsx(
                                    'rounded-md px-2 py-0.5 text-xs font-medium transition disabled:opacity-40',
                                    active
                                      ? 'bg-brand text-white'
                                      : 'text-neutral-300 hover:bg-neutral-700/60',
                                  )}
                                >
                                  {s === 'BACHATA' ? 'Bachata' : 'Salsa'}
                                </button>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>
                Cancelar
              </Button>
              <Button
                disabled={saving || selections.length === 0}
                onClick={save}
              >
                {saving
                  ? 'Importando…'
                  : `Importar ${selections.length} al catálogo`}
              </Button>
            </div>
          </>
        )}

        {result && (
          <div className="mt-4">
            <p className="text-sm text-neutral-300">
              ✓ Importación completa: {result.created} creadas, {result.updated}{' '}
              ya estaban
              {result.errors.length ? `, ${result.errors.length} errores` : ''}{' '}
              (de {result.total}).
            </p>
            {result.errors.length > 0 && (
              <ul className="mt-2 max-h-40 list-disc overflow-auto pl-5 text-xs text-red-300">
                {result.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex justify-end">
              <Button onClick={onClose}>Listo</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
