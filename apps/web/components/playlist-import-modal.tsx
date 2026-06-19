'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  DANCE_STYLES,
  type DanceStyle,
  type ExtractedTrackMetadata,
  type PlaylistImportResult,
} from '@baile-latino/types';
import { api, ApiError } from '@/lib/api';
import { Button, Input, Select, Spinner } from './ui';

export function PlaylistImportModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
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
    setLoading(true);
    try {
      const res = await api<ExtractedTrackMetadata[]>(
        '/music/tracks/playlist-preview',
        { method: 'POST', body: { link } },
      );
      setItems(res);
      // Estilo inicial por fila: el detectado, o el por defecto si no hay.
      const init: Record<string, DanceStyle> = {};
      for (const it of res) init[it.sourceId] = it.detectedStyle ?? defaultStyle;
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
      const res = await api<PlaylistImportResult>(
        '/music/tracks/import-playlist',
        { method: 'POST', body: { link, defaultStyle, overrides: rowStyles } },
      );
      setResult(res);
      void qc.invalidateQueries({ queryKey: ['catalog'] });
      void qc.invalidateQueries({ queryKey: ['catalog-summary'] });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'No se pudo importar');
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
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border border-neutral-800 bg-neutral-900 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">📺 Importar playlist de YouTube</h2>
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

        {err && <p className="mt-3 text-sm text-red-300">{err}</p>}

        {loading && (
          <div className="mt-4">
            <Spinner label="Leyendo la playlist…" />
          </div>
        )}

        {items && !result && (
          <>
            <div className="mt-4 flex items-center justify-between">
              <span className="text-sm text-neutral-400">
                {items.length} canciones encontradas
              </span>
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
            </div>

            <div className="mt-3 flex-1 overflow-auto rounded-lg border border-neutral-800">
              <table className="w-full text-sm">
                <thead className="sticky top-0 border-b border-neutral-800 bg-neutral-900 text-left text-neutral-400">
                  <tr>
                    <th className="px-3 py-2">Título</th>
                    <th className="px-3 py-2">Artista</th>
                    <th className="px-3 py-2">Estilo</th>
                    <th className="px-3 py-2 w-16">Año</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr
                      key={it.sourceId}
                      className="border-b border-neutral-800/60 last:border-0"
                    >
                      <td className="px-3 py-2 font-medium">{it.title}</td>
                      <td className="px-3 py-2 text-neutral-300">
                        {it.artist ?? it.channelTitle ?? '—'}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <Select
                            value={rowStyles[it.sourceId] ?? defaultStyle}
                            onChange={(e) =>
                              setRowStyle(it.sourceId, e.target.value as DanceStyle)
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
                      </td>
                      <td className="px-3 py-2 text-neutral-400">
                        {it.year ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>
                Cancelar
              </Button>
              <Button disabled={saving} onClick={save}>
                {saving ? 'Guardando…' : `Guardar ${items.length} al catálogo`}
              </Button>
            </div>
          </>
        )}

        {result && (
          <div className="mt-4">
            <p className="text-sm text-neutral-300">
              ✓ Importación completa: {result.created} creadas,{' '}
              {result.updated} actualizadas
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
