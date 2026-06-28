'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  DANCE_STYLES,
  type DanceStyle,
  type ExtractedTrackMetadata,
  type PlaylistImportResult,
  type Track,
} from '@baile-latino/types';
import { api, ApiError } from '@/lib/api';
import { Button, Input, Select, Spinner } from './ui';
import { trackThumbUrl } from './track-thumb';
import { clsx } from './clsx';

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
  const [defaultStyle, setDefaultStyle] = useState<DanceStyle>('BACHATA');
  const [items, setItems] = useState<ExtractedTrackMetadata[] | null>(null);
  /** Estilo elegido por fila (sourceId -> estilo). Editable en el preview. */
  const [rowStyles, setRowStyles] = useState<Record<string, DanceStyle>>({});
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

  function applyDefault(style: DanceStyle) {
    setDefaultStyle(style);
    // El default solo pisa filas sin estilo detectado y no editadas a mano.
    if (!items) return;
    setRowStyles((prev) => {
      const next = { ...prev };
      for (const it of items) {
        if (!it.detectedStyle && !touched.has(it.sourceId)) {
          next[it.sourceId] = style;
        }
      }
      return next;
    });
  }

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
      // En Mis Canciones, ignora las que ya tengo (avisa cuántas).
      let shown = res;
      if (isLibrary) {
        const existing = await api<string[]>('/music/library/youtube-source-ids');
        const have = new Set(existing);
        shown = res.filter((it) => !have.has(it.sourceId));
        setSkipped(res.length - shown.length);
      }
      setItems(shown);
      // Estilo inicial por fila. En Mis Canciones, las NO detectadas quedan sin
      // estilo (sin marcar); en el catálogo se usa el estilo por defecto.
      const init: Record<string, DanceStyle> = {};
      for (const it of shown) {
        if (it.detectedStyle) init[it.sourceId] = it.detectedStyle;
        else if (!isLibrary) init[it.sourceId] = defaultStyle;
      }
      setRowStyles(init);
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
      const res = await api<PlaylistImportResult>(importPath, {
        method: 'POST',
        body: isLibrary
          ? { link, overrides: rowStyles } // sin estilo por defecto
          : { link, defaultStyle, overrides: rowStyles },
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

  // En Mis Canciones, solo se importan las que tienen estilo elegido.
  const willImport =
    items && isLibrary
      ? items.filter((it) => rowStyles[it.sourceId]).length
      : (items?.length ?? 0);
  const missing = items && isLibrary ? items.length - willImport : 0;

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
          <h2 className="font-semibold">
            {isLibrary
              ? '📺 Cargar playlist a Mis Canciones'
              : '📺 Importar playlist de YouTube'}
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
          (/no es p[úu]blica|vac[íi]a/i.test(err) ? (
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
            <Spinner label="Leyendo la playlist…" />
          </div>
        )}

        {skipped > 0 && !result && (
          <p className="mt-3 rounded-lg border border-clave/30 bg-clave/10 px-3 py-2 text-xs text-clave">
            ℹ️ {skipped} {skipped === 1 ? 'canción ya estaba' : 'canciones ya estaban'}{' '}
            en Mis Canciones — se {skipped === 1 ? 'ignora' : 'ignoran'}.
          </p>
        )}

        {items && items.length === 0 && !result && (
          <p className="mt-4 rounded-lg border border-neutral-800 bg-neutral-800/40 px-3 py-4 text-center text-sm text-neutral-400">
            {isLibrary && skipped > 0
              ? 'Todas las canciones de la playlist ya están en Mis Canciones.'
              : 'No se encontraron canciones nuevas.'}
          </p>
        )}

        {items && items.length > 0 && !result && (
          <>
            <div className="mt-4 flex items-center justify-between">
              <span className="text-sm text-neutral-400">
                {items.length}{' '}
                {isLibrary ? 'canciones nuevas' : 'canciones encontradas'}
                {isLibrary && missing > 0 && (
                  <span className="ml-2 text-amber-300/90">
                    · {missing} sin estilo (elige para incluirla)
                  </span>
                )}
              </span>
              {!isLibrary && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-neutral-400">
                    Estilo por defecto:
                  </span>
                  <Select
                    value={defaultStyle}
                    onChange={(e) => applyDefault(e.target.value as DanceStyle)}
                  >
                    {DANCE_STYLES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
            </div>

            {/* Reproductor propio del modal (la fila elegida suena aquí). */}
            {nowPlaying && (
              <div className="mt-3 flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-950 p-2">
                <iframe
                  key={nowPlaying.sourceId}
                  src={`https://www.youtube-nocookie.com/embed/${nowPlaying.sourceId}?autoplay=1&rel=0`}
                  title={nowPlaying.title}
                  allow="autoplay; encrypted-media"
                  allowFullScreen
                  className="aspect-video h-20 w-36 shrink-0 rounded bg-black"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {nowPlaying.title}
                  </div>
                  <div className="truncate text-xs text-neutral-400">
                    {nowPlaying.artist ?? nowPlaying.channelTitle ?? ''}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setNowPlaying(null)}
                  title="Cerrar reproductor"
                  className="shrink-0 rounded-md bg-neutral-800 px-2 py-1 text-sm hover:bg-neutral-700"
                >
                  ✕
                </button>
              </div>
            )}

            <div className="mt-3 flex-1 overflow-auto rounded-lg border border-neutral-800">
              <table className="w-full text-sm">
                <thead className="sticky top-0 border-b border-neutral-800 bg-neutral-900 text-left text-neutral-400">
                  <tr>
                    <th className="w-14 px-2 py-2"></th>
                    <th className="px-3 py-2">Título</th>
                    <th className="px-3 py-2">Artista</th>
                    <th className="w-10 px-2 py-2"></th>
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
                        <td className="px-2 py-2">
                          <button
                            type="button"
                            title={playing ? 'Detener' : 'Reproducir'}
                            aria-label={playing ? 'Detener' : 'Reproducir'}
                            onClick={() => setNowPlaying(playing ? null : it)}
                            className={clsx(
                              'rounded-md px-2 py-1 text-sm transition',
                              playing
                                ? 'bg-brand/20 text-brand'
                                : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100',
                            )}
                          >
                            {playing ? '⏸' : '▶'}
                          </button>
                        </td>
                        <td className="px-3 py-2">
                          {isLibrary ? (
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
                                  (catálogo)
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              <Select
                                value={value ?? defaultStyle}
                                onChange={(e) =>
                                  setRowStyle(
                                    it.sourceId,
                                    e.target.value as DanceStyle,
                                  )
                                }
                              >
                                {DANCE_STYLES.map((s) => (
                                  <option key={s} value={s}>
                                    {s}
                                  </option>
                                ))}
                              </Select>
                              <span className="text-[10px] text-neutral-500">
                                {touched.has(it.sourceId)
                                  ? '(manual)'
                                  : it.detectedStyle
                                    ? '(auto)'
                                    : '(defecto)'}
                              </span>
                            </div>
                          )}
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
              <Button
                disabled={saving || (isLibrary && willImport === 0)}
                onClick={save}
              >
                {saving
                  ? 'Guardando…'
                  : isLibrary
                    ? `Guardar ${willImport} a Mis Canciones`
                    : `Guardar ${items.length} al catálogo`}
              </Button>
            </div>
          </>
        )}

        {result && (
          <div className="mt-4">
            <p className="text-sm text-neutral-300">
              ✓ Importación completa: {result.created}{' '}
              {isLibrary ? 'agregadas' : 'creadas'},{' '}
              {result.updated} {isLibrary ? 'ya estaban' : 'actualizadas'}
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
