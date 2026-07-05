'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  type DanceStyle,
  type ExtractedTrackMetadata,
  type PlaylistImportResult,
  type Track,
} from '@baile-latino/types';
import { api, ApiError } from '@/lib/api';
import { Button, Input } from './ui';
import { LoadingBar } from './loading-bar';
import { InlineAudioPlayer } from './player';
import { trackThumbUrl } from './track-thumb';
import { YoutubeIcon } from './youtube-icon';
import { clsx } from './clsx';
import { MONTHS, maxMonthFor } from '@/lib/months';

export function PlaylistImportModal({
  onClose,
  target = 'catalog',
}: {
  onClose: () => void;
  /** 'catalog' = catálogo global (admin); 'library' = Mis Canciones (privadas). */
  target?: 'catalog' | 'library';
}) {
  const qc = useQueryClient();
  const isLibrary = target === 'library';
  const previewPath = isLibrary
    ? '/music/library/playlist-preview'
    : '/music/tracks/playlist-preview';
  const importPath = isLibrary
    ? '/music/library/import-playlist'
    : '/music/tracks/import-playlist';
  const [link, setLink] = useState('');
  const [items, setItems] = useState<ExtractedTrackMetadata[] | null>(null);
  /** Estilo elegido por fila (sourceId -> estilo). Editable en el preview. */
  const [rowStyles, setRowStyles] = useState<Record<string, DanceStyle>>({});
  /** Año editado por fila (sourceId -> año como texto, para editar libremente). */
  const [rowYears, setRowYears] = useState<Record<string, string>>({});
  /** Mes editado por fila (sourceId -> "01".."12" o "" = sin mes). */
  const [rowMonths, setRowMonths] = useState<Record<string, string>>({});
  /** Mes+año original de subida (para no pisar el día real si no se edita). */
  const [origDates, setOrigDates] = useState<
    Record<string, { m: string; y: string }>
  >({});
  /** Filas que el usuario tocó a mano (no las pisa el "estilo por defecto"). */
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<PlaylistImportResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  /** Cuántas canciones de la playlist ya estaban en Mis Canciones (se ignoran). */
  const [skipped, setSkipped] = useState(0);
  /** Canción sonando en el reproductor propio del modal (arriba de la tabla). */
  const [nowPlaying, setNowPlaying] = useState<ExtractedTrackMetadata | null>(
    null,
  );

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
      setErr('Pega el link de una playlist pública.');
      return;
    }
    setErr(null);
    setResult(null);
    setItems(null);
    setSkipped(0);
    setNowPlaying(null);
    setLoading(true);
    try {
      const res = await api<ExtractedTrackMetadata[]>(previewPath, {
        method: 'POST',
        body: { link },
      });
      // Ignora las que ya están (en Mis Canciones o en el catálogo) y avisa cuántas.
      const existing = await api<string[]>(
        isLibrary
          ? '/music/library/youtube-source-ids'
          : '/music/tracks/catalog-youtube-ids',
      );
      const have = new Set(existing);
      // La playlist puede traer el mismo video repetido: se deja una sola vez
      // (el estado por fila se indexa por sourceId y no debe colisionar).
      const seen = new Set<string>();
      const unique = res.filter((it) => {
        if (seen.has(it.sourceId)) return false;
        seen.add(it.sourceId);
        return true;
      });
      const shown = unique.filter((it) => !have.has(it.sourceId));
      setSkipped(unique.length - shown.length);
      setItems(shown);
      // Estilo inicial por fila: el detectado (catálogo en Mis Canciones / por
      // palabras en el catálogo). Las NO detectadas quedan SIN estilo (sin marcar).
      // Mes+año inicial: de la FECHA DE SUBIDA de YouTube (details.publishedAt).
      const init: Record<string, DanceStyle> = {};
      const initYears: Record<string, string> = {};
      const initMonths: Record<string, string> = {};
      const orig: Record<string, { m: string; y: string }> = {};
      for (const it of shown) {
        if (it.detectedStyle) init[it.sourceId] = it.detectedStyle;
        const pub = it.details?.publishedAt ?? '';
        const ym = /^(\d{4})-(\d{2})/.exec(pub);
        if (ym) {
          initYears[it.sourceId] = ym[1];
          initMonths[it.sourceId] = ym[2];
          orig[it.sourceId] = { y: ym[1], m: ym[2] };
        } else if (it.year != null) {
          initYears[it.sourceId] = String(it.year);
          orig[it.sourceId] = { y: String(it.year), m: '' };
        }
      }
      setRowStyles(init);
      setRowYears(initYears);
      setRowMonths(initMonths);
      setOrigDates(orig);
      setTouched(new Set());
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'No se pudo leer la playlist');
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    setErr(null);
    setSaving(true);
    try {
      // Años editados (solo los válidos de 4 dígitos) como { sourceId: número }.
      const yearOverrides = Object.fromEntries(
        Object.entries(rowYears)
          .filter(([, v]) => /^\d{4}$/.test(v))
          .map(([k, v]) => [k, Number(v)]),
      );
      // Fecha (mes+año) editada → "YYYY-MM-01". Solo se envía si el usuario
      // CAMBIÓ el mes/año respecto a la subida; si no, el backend usa la fecha
      // de subida completa (con su día real, más preciso para rep/día).
      const dateOverrides: Record<string, string> = {};
      for (const [sid, m] of Object.entries(rowMonths)) {
        const y = rowYears[sid];
        const og = origDates[sid];
        const changed = !og || m !== og.m || (y ?? '') !== og.y;
        if (changed && m && /^\d{4}$/.test(y ?? '')) {
          dateOverrides[sid] = `${y}-${m}-01`;
        }
      }
      const res = await api<PlaylistImportResult>(importPath, {
        method: 'POST',
        // Sin estilo por defecto: el estilo sale de lo detectado o de la elección.
        body: { link, overrides: rowStyles, yearOverrides, dateOverrides },
      });
      setResult(res);
      if (isLibrary) {
        void qc.invalidateQueries({ queryKey: ['library'] });
        void qc.invalidateQueries({ queryKey: ['library-summary'] });
        void qc.invalidateQueries({ queryKey: ['library-drawer'] });
      } else {
        void qc.invalidateQueries({ queryKey: ['catalog'] });
        void qc.invalidateQueries({ queryKey: ['catalog-summary'] });
      }
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'No se pudo importar');
    } finally {
      setSaving(false);
    }
  }

  // Solo se importan las que tienen estilo (detectado o elegido).
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
          <h2 className="flex items-center gap-2 font-semibold">
            <YoutubeIcon className="h-5 w-5 text-[#FF0000]" />
            {isLibrary
              ? 'Cargar playlist a Mis Canciones'
              : 'Importar playlist de YouTube'}
          </h2>
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
              Link de la playlist pública
            </label>
            <Input
              placeholder="https://www.youtube.com/playlist?list=…"
              value={link}
              onChange={(e) => setLink(e.target.value)}
            />
          </div>
          <Button variant="ghost" disabled={loading} onClick={preview}>
            {loading ? 'Cargando…' : 'Cargar'}
          </Button>
        </div>

        {err &&
          (/cuota/i.test(err) ? (
            <p className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200/90">
              ⚠️ <strong>{err}</strong>
            </p>
          ) : /no es p[úu]blica|vac[íi]a/i.test(err) ? (
            <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200/90">
              ⚠️ No se pudo leer la playlist: debe ser <strong>Pública</strong> o{' '}
              <strong>No listada</strong> (Unlisted), no <strong>privada</strong>{' '}
              (en YouTube: editar playlist → Visibilidad).
            </p>
          ) : (
            <p className="mt-3 text-sm text-red-300">{err}</p>
          ))}

        {loading && (
          <div className="mt-4">
            <LoadingBar
              label="Leyendo y resolviendo la playlist en YouTube… (puede tardar en playlists grandes)"
              estMs={12000}
            />
          </div>
        )}

        {skipped > 0 && !result && (
          <p className="mt-3 rounded-lg border border-clave/30 bg-clave/10 px-3 py-2 text-xs text-clave">
            ℹ️ {skipped} {skipped === 1 ? 'canción ya estaba' : 'canciones ya estaban'}{' '}
            en {isLibrary ? 'Mis Canciones' : 'el catálogo'} — se{' '}
            {skipped === 1 ? 'ignora' : 'ignoran'}.
          </p>
        )}

        {items && items.length === 0 && !result && (
          <p className="mt-4 rounded-lg border border-neutral-800 bg-neutral-800/40 px-3 py-4 text-center text-sm text-neutral-400">
            {skipped > 0
              ? `Todas las canciones de la playlist ya están en ${isLibrary ? 'Mis Canciones' : 'el catálogo'}.`
              : 'No se encontraron canciones nuevas.'}
          </p>
        )}

        {items && items.length > 0 && !result && (
          <>
            <div className="mt-4 flex items-center justify-between">
              <span className="text-sm text-neutral-400">
                {items.length}{' '}
                {isLibrary ? 'canciones nuevas' : 'canciones encontradas'}
                {missing > 0 && (
                  <span className="ml-2 text-amber-300/90">
                    · {missing} sin estilo (elige para incluirla)
                  </span>
                )}
              </span>
            </div>

            {/* Reproductor de audio propio del modal (la fila elegida suena aquí). */}
            {nowPlaying && (
              <div className="mt-3">
                <InlineAudioPlayer
                  key={nowPlaying.sourceId}
                  track={
                    {
                      ...(nowPlaying as unknown as Track),
                      artist:
                        nowPlaying.artist ?? nowPlaying.channelTitle ?? '—',
                    } as Track
                  }
                  onClose={() => setNowPlaying(null)}
                />
              </div>
            )}

            <div className="no-scrollbar mt-3 flex-1 overflow-auto rounded-lg border border-neutral-800">
              <table className="w-full text-sm">
                <thead className="sticky top-0 border-b border-neutral-800 bg-neutral-900 text-left text-neutral-400">
                  <tr>
                    <th className="w-10 px-2 py-2"></th>
                    <th className="w-14 px-2 py-2"></th>
                    <th className="px-3 py-2">Título</th>
                    <th className="px-3 py-2">Artista</th>
                    <th className="px-3 py-2">Estilo</th>
                    <th className="w-16 px-3 py-2">Año</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => {
                    const playing = nowPlaying?.sourceId === it.sourceId;
                    const url = trackThumbUrl(it as unknown as Track);
                    const value = rowStyles[it.sourceId];
                    return (
                      <tr
                        key={it.sourceId}
                        className="border-b border-neutral-800/60 last:border-0"
                      >
                        <td className="px-2 py-2">
                          <button
                            type="button"
                            title={playing ? 'Detener' : 'Reproducir'}
                            aria-label={playing ? 'Detener' : 'Reproducir'}
                            onClick={() => setNowPlaying(playing ? null : it)}
                            className={clsx(
                              'flex h-8 w-8 items-center justify-center rounded-full text-sm transition',
                              playing
                                ? 'bg-brand text-white'
                                : 'bg-neutral-800 text-neutral-200 hover:bg-neutral-700',
                            )}
                          >
                            {playing ? '⏸' : '▶'}
                          </button>
                        </td>
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
                        <td className="px-3 py-2 font-medium">{it.title}</td>
                        <td className="px-3 py-2 text-neutral-300">
                          {it.artist ?? it.channelTitle ?? '—'}
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
                                {isLibrary ? '(catálogo)' : '(auto)'}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-neutral-400">
                          <div className="flex items-center gap-1">
                            <select
                              value={rowMonths[it.sourceId] ?? ''}
                              onChange={(e) =>
                                setRowMonths((prev) => ({
                                  ...prev,
                                  [it.sourceId]: e.target.value,
                                }))
                              }
                              className="rounded-md border border-transparent bg-neutral-800/60 px-1 py-1 text-sm text-neutral-200 hover:border-neutral-700 focus:border-brand focus:bg-neutral-800 focus:outline-none"
                            >
                              <option value="">—</option>
                              {MONTHS.slice(
                                0,
                                maxMonthFor(rowYears[it.sourceId] ?? ''),
                              ).map((m, i) => (
                                <option
                                  key={m}
                                  value={String(i + 1).padStart(2, '0')}
                                >
                                  {m}
                                </option>
                              ))}
                            </select>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={rowYears[it.sourceId] ?? ''}
                              placeholder="—"
                              onFocus={(e) => e.currentTarget.select()}
                              onChange={(e) => {
                                const y = e.target.value
                                  .replace(/[^0-9]/g, '')
                                  .slice(0, 4);
                                setRowYears((prev) => ({
                                  ...prev,
                                  [it.sourceId]: y,
                                }));
                                // Si el mes elegido ya no es válido para el nuevo año, lo limpia.
                                setRowMonths((prev) => {
                                  const m = prev[it.sourceId];
                                  if (m && Number(m) > maxMonthFor(y)) {
                                    return { ...prev, [it.sourceId]: '' };
                                  }
                                  return prev;
                                });
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') e.currentTarget.blur();
                              }}
                              className="w-16 rounded-md border border-transparent bg-neutral-800/60 px-2 py-1 text-sm text-neutral-200 [appearance:textfield] hover:border-neutral-700 focus:border-brand focus:bg-neutral-800 focus:outline-none"
                            />
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
              <Button disabled={saving || willImport === 0} onClick={save}>
                {saving
                  ? 'Guardando…'
                  : isLibrary
                    ? `Guardar ${willImport} a Mis Canciones`
                    : `Guardar ${willImport} al catálogo`}
              </Button>
            </div>
          </>
        )}

        {result && (
          <div className="mt-4">
            <p className="text-sm text-neutral-300">
              ✓ Importación completa: {result.created}{' '}
              {isLibrary ? 'agregadas' : 'creadas'}, {result.updated} ya estaban
              {result.errors.length ? `, ${result.errors.length} errores` : ''}{' '}
              (de {result.total}).
            </p>
            {result.errors.length > 0 && (
              <ul className="no-scrollbar mt-2 max-h-40 list-disc overflow-auto pl-5 text-xs text-red-300">
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
