'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { DanceStyle, PlaylistImportResult } from '@baile-latino/types';
import { api, ApiError } from '@/lib/api';
import { Button, Input } from './ui';
import { LoadingBar } from './loading-bar';
import { clsx } from './clsx';

/** Una canción resuelta de una playlist de Spotify (del preview). */
interface SpotifyResolved {
  source: 'SPOTIFY';
  sourceId: string;
  url: string;
  title: string;
  artist: string | null;
  durationSec: number | null;
  year: number | null;
  coverUrl: string | null;
  detectedStyle: DanceStyle | null;
}

/**
 * Importa una playlist de Spotify al catálogo de Spotify (como tracks Spotify).
 * Equivalente a "Importar playlist YouTube", pero todo dentro de Spotify.
 */
export function SpotifyCatalogImportModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [link, setLink] = useState('');
  const [items, setItems] = useState<SpotifyResolved[] | null>(null);
  const [rowStyles, setRowStyles] = useState<Record<string, DanceStyle>>({});
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<PlaylistImportResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [skipped, setSkipped] = useState(0);

  function setRowStyle(sourceId: string, style: DanceStyle) {
    setRowStyles((prev) => ({ ...prev, [sourceId]: style }));
    setTouched((prev) => new Set(prev).add(sourceId));
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function preview() {
    if (!link.trim()) {
      setErr('Pega el link de una playlist pública de Spotify.');
      return;
    }
    setErr(null);
    setResult(null);
    setItems(null);
    setSkipped(0);
    setLoading(true);
    try {
      const res = await api<SpotifyResolved[]>(
        '/music/tracks/spotify-catalog-preview',
        { method: 'POST', body: { link } },
      );
      const existing = await api<string[]>('/music/tracks/catalog-spotify-ids');
      const have = new Set(existing);
      const shown = res.filter((it) => !have.has(it.sourceId));
      setSkipped(res.length - shown.length);
      setItems(shown);
      const init: Record<string, DanceStyle> = {};
      for (const it of shown) if (it.detectedStyle) init[it.sourceId] = it.detectedStyle;
      setRowStyles(init);
      setTouched(new Set());
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'No se pudo leer la playlist');
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!items) return;
    setErr(null);
    setSaving(true);
    try {
      const payload = items.map((it) => ({
        sourceId: it.sourceId,
        title: it.title,
        artist: it.artist,
        durationSec: it.durationSec,
        year: it.year,
        coverUrl: it.coverUrl,
        detectedStyle: it.detectedStyle,
      }));
      const res = await api<PlaylistImportResult>(
        '/music/tracks/spotify-catalog-import',
        { method: 'POST', body: { items: payload, overrides: rowStyles } },
      );
      setResult(res);
      void qc.invalidateQueries({ queryKey: ['catalog'] });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'No se pudo importar');
    } finally {
      setSaving(false);
    }
  }

  const willImport = items
    ? items.filter((it) => rowStyles[it.sourceId]).length
    : 0;
  const missing = items ? items.length - willImport : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border border-neutral-800 bg-neutral-900 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">🟢 Importar playlist de Spotify al catálogo</h2>
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
            {loading ? 'Cargando…' : 'Cargar'}
          </Button>
        </div>

        {err && <p className="mt-3 text-sm text-red-300">{err}</p>}

        {loading && (
          <div className="mt-4">
            <LoadingBar
              label="Leyendo y resolviendo la playlist en Spotify… (puede tardar en playlists grandes)"
              estMs={30000}
            />
          </div>
        )}

        {skipped > 0 && !result && (
          <p className="mt-3 rounded-lg border border-clave/30 bg-clave/10 px-3 py-2 text-xs text-clave">
            ℹ️ {skipped} {skipped === 1 ? 'canción ya estaba' : 'canciones ya estaban'}{' '}
            en el catálogo — se {skipped === 1 ? 'ignora' : 'ignoran'}.
          </p>
        )}

        {items && items.length === 0 && !result && (
          <p className="mt-4 rounded-lg border border-neutral-800 bg-neutral-800/40 px-3 py-4 text-center text-sm text-neutral-400">
            {skipped > 0
              ? 'Todas las canciones de la playlist ya están en el catálogo.'
              : 'No se encontraron canciones.'}
          </p>
        )}

        {items && items.length > 0 && !result && (
          <>
            <div className="mt-4 flex items-center justify-between">
              <span className="text-sm text-neutral-400">
                {items.length} canciones encontradas
                {missing > 0 && (
                  <span className="ml-2 text-amber-300/90">
                    · {missing} sin estilo (elige para incluirla)
                  </span>
                )}
              </span>
            </div>

            <div className="mt-3 flex-1 overflow-auto rounded-lg border border-neutral-800">
              <table className="w-full text-sm">
                <thead className="sticky top-0 border-b border-neutral-800 bg-neutral-900 text-left text-neutral-400">
                  <tr>
                    <th className="w-14 px-2 py-2"></th>
                    <th className="px-3 py-2">Título</th>
                    <th className="px-3 py-2">Artista</th>
                    <th className="px-3 py-2">Estilo</th>
                    <th className="w-16 px-3 py-2">Año</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => {
                    const value = rowStyles[it.sourceId];
                    return (
                      <tr
                        key={it.sourceId}
                        className="border-b border-neutral-800/60 last:border-0"
                      >
                        <td className="px-2 py-2">
                          {it.coverUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={it.coverUrl}
                              alt=""
                              loading="lazy"
                              className="h-12 w-12 rounded bg-neutral-800 object-cover"
                            />
                          ) : (
                            <div className="h-12 w-12 rounded bg-neutral-800" />
                          )}
                        </td>
                        <td className="px-3 py-2 font-medium">{it.title}</td>
                        <td className="px-3 py-2 text-neutral-300">
                          {it.artist ?? '—'}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            <div className="inline-flex gap-1 rounded-lg bg-neutral-800/60 p-0.5">
                              {(['BACHATA', 'SALSA'] as const).map((s) => {
                                const active = value === s;
                                return (
                                  <button
                                    key={s}
                                    type="button"
                                    onClick={() => setRowStyle(it.sourceId, s)}
                                    className={clsx(
                                      'rounded-md px-2 py-0.5 text-xs font-medium transition',
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
                            {it.detectedStyle && !touched.has(it.sourceId) && (
                              <span className="text-[10px] text-neutral-500">
                                (auto)
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-neutral-400">
                          {it.year ?? '—'}
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
              <Button disabled={saving || willImport === 0} onClick={save}>
                {saving ? 'Guardando…' : `Guardar ${willImport} al catálogo`}
              </Button>
            </div>
          </>
        )}

        {result && (
          <div className="mt-4">
            <p className="text-sm text-neutral-300">
              ✓ Importación completa: {result.created} creadas, {result.updated} ya
              estaban
              {result.errors.length ? `, ${result.errors.length} errores` : ''} (de{' '}
              {result.total}).
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
