'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Paginated, Track } from '@baile-latino/types';
import { api, ApiError } from '@/lib/api';
import { Button, Card, Spinner } from './ui';
import { PlatformIcon } from './platform-icon';
import { MONTHS, maxMonthFor, splitReleaseDate } from '@/lib/months';
import { formatReleaseDate } from '@/lib/format';
import { clsx } from './clsx';

const hasMonth = (rd?: string | null) => !!rd && /^\d{4}-\d{2}/.test(rd);

/**
 * Gestor masivo de fechas de lanzamiento del catálogo (una fuente). Lista las
 * canciones, marca las que no tienen mes (candidatas a recalcular), y permite
 * editar mes+año por fila o resetear (poner null → el backfill la recalcula).
 */
export function DateManagerModal({
  source,
  onClose,
}: {
  source: 'YOUTUBE' | 'SPOTIFY';
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [onlyIncomplete, setOnlyIncomplete] = useState(true);
  const [months, setMonths] = useState<Record<string, string>>({});
  const [years, setYears] = useState<Record<string, string>>({});
  const [result, setResult] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['date-manager', source],
    queryFn: () =>
      api<Paginated<Track>>(`/music/tracks?source=${source}&pageSize=1000`),
  });
  const tracks = useMemo(() => data?.data ?? [], [data]);

  // Inicializa mes/año desde la fecha actual (o el año del track).
  useEffect(() => {
    const mo: Record<string, string> = {};
    const yr: Record<string, string> = {};
    for (const t of tracks) {
      const s = splitReleaseDate(t.releaseDate);
      mo[t.id] = s.month;
      yr[t.id] = s.year || (t.year != null ? String(t.year) : '');
    }
    setMonths(mo);
    setYears(yr);
  }, [tracks]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const incompleteCount = useMemo(
    () => tracks.filter((t) => !hasMonth(t.releaseDate)).length,
    [tracks],
  );
  const shown = useMemo(
    () => (onlyIncomplete ? tracks.filter((t) => !hasMonth(t.releaseDate)) : tracks),
    [tracks, onlyIncomplete],
  );

  // Mes/año original de cada track (para detectar cambios reales, ignorando el día).
  const originals = useMemo(() => {
    const o: Record<string, { month: string; year: string }> = {};
    for (const t of tracks) {
      const s = splitReleaseDate(t.releaseDate);
      o[t.id] = {
        month: s.month,
        year: s.year || (t.year != null ? String(t.year) : ''),
      };
    }
    return o;
  }, [tracks]);

  // ¿La fila cambió respecto al original? (compara mes+año, NO el día).
  function changedFor(id: string): boolean {
    const og = originals[id];
    if (!og) return false;
    return (months[id] ?? '') !== og.month || (years[id] ?? '') !== og.year;
  }

  // Fecha resultante para una fila según mes/año: "YYYY-MM-01" | "YYYY" | null.
  function valueFor(id: string): string | null {
    const m = months[id];
    const y = years[id];
    if (m && /^\d{4}$/.test(y ?? '')) return `${y}-${m}-01`;
    if (/^\d{4}$/.test(y ?? '')) return y;
    return null;
  }

  const changed = useMemo(
    () => tracks.filter((t) => changedFor(t.id)).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tracks, months, years, originals],
  );

  const save = useMutation({
    mutationFn: () => {
      const dates: Record<string, string | null> = {};
      for (const t of tracks) {
        if (changedFor(t.id)) dates[t.id] = valueFor(t.id);
      }
      return api<{ updated: number }>('/music/tracks/release-dates', {
        method: 'PATCH',
        body: { dates },
      });
    },
    onSuccess: (r) => {
      setResult(r.updated);
      void qc.invalidateQueries({ queryKey: ['catalog'] });
    },
    onError: (e) =>
      setErr(e instanceof ApiError ? e.message : 'No se pudieron guardar'),
  });

  function resetRow(id: string) {
    setMonths((p) => ({ ...p, [id]: '' }));
    setYears((p) => ({ ...p, [id]: '' }));
  }
  function resetAllShown() {
    setMonths((p) => {
      const n = { ...p };
      for (const t of shown) n[t.id] = '';
      return n;
    });
    setYears((p) => {
      const n = { ...p };
      for (const t of shown) n[t.id] = '';
      return n;
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={() => !save.isPending && onClose()}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-xl border border-neutral-800 bg-neutral-900 p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-semibold">
            <PlatformIcon
              source={source}
              className={clsx('h-5 w-5', source === 'YOUTUBE' && 'text-[#FF0000]')}
            />
            Actualizar fechas de lanzamiento ({source === 'SPOTIFY' ? 'Spotify' : 'YouTube'})
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg bg-neutral-800 px-2 py-1 text-sm hover:bg-neutral-700"
          >
            ✕
          </button>
        </div>

        <p className="mb-3 text-xs text-neutral-400">
          Edita mes+año, o resetea (↻) para que se recalcule sola. Dejar mes en
          “—” y guardar deja solo el año; vaciar mes y año resetea la fecha.
        </p>

        {isLoading && <Spinner />}

        {result != null ? (
          <Card className="text-sm text-emerald-300">
            ✓ {result} fecha{result === 1 ? '' : 's'} actualizada
            {result === 1 ? '' : 's'}. Las reseteadas se recalculan solas al
            volver al catálogo.
          </Card>
        ) : (
          data && (
            <>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="inline-flex rounded-lg border border-neutral-700 p-0.5 text-sm">
                  {([true, false] as const).map((v) => (
                    <button
                      key={String(v)}
                      type="button"
                      onClick={() => setOnlyIncomplete(v)}
                      className={clsx(
                        'rounded-md px-3 py-1 transition',
                        onlyIncomplete === v
                          ? 'bg-brand text-white'
                          : 'text-neutral-300 hover:bg-neutral-800',
                      )}
                    >
                      {v ? `Sin mes (${incompleteCount})` : `Todas (${tracks.length})`}
                    </button>
                  ))}
                </div>
                <Button variant="ghost" onClick={resetAllShown}>
                  ↻ Recalcular las mostradas ({shown.length})
                </Button>
              </div>

              <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-neutral-800">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 border-b border-neutral-800 bg-neutral-900 text-left text-neutral-400">
                    <tr>
                      <th className="px-3 py-2">Título</th>
                      <th className="px-3 py-2">Artista</th>
                      <th className="px-3 py-2">Actual</th>
                      <th className="px-3 py-2">Nueva fecha</th>
                      <th className="px-2 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((t) => {
                      const willChange = changedFor(t.id);
                      return (
                        <tr
                          key={t.id}
                          className={clsx(
                            'border-b border-neutral-800/60 last:border-0',
                            willChange && 'bg-brand/5',
                          )}
                        >
                          <td className="max-w-[16rem] truncate px-3 py-2 font-medium">
                            {t.title}
                          </td>
                          <td className="max-w-[10rem] truncate px-3 py-2 text-neutral-300">
                            {t.artist}
                          </td>
                          <td className="px-3 py-2 text-neutral-400">
                            {formatReleaseDate(t.releaseDate, t.year)}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1">
                              <select
                                value={months[t.id] ?? ''}
                                onChange={(e) =>
                                  setMonths((p) => ({ ...p, [t.id]: e.target.value }))
                                }
                                className="rounded-md border border-transparent bg-neutral-800/60 px-1 py-1 text-sm text-neutral-200 hover:border-neutral-700 focus:border-brand focus:bg-neutral-800 focus:outline-none"
                              >
                                <option value="">—</option>
                                {MONTHS.slice(0, maxMonthFor(years[t.id] ?? '')).map(
                                  (m, i) => (
                                    <option key={m} value={String(i + 1).padStart(2, '0')}>
                                      {m}
                                    </option>
                                  ),
                                )}
                              </select>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={years[t.id] ?? ''}
                                placeholder="—"
                                onFocus={(e) => e.currentTarget.select()}
                                onChange={(e) => {
                                  const y = e.target.value.replace(/[^0-9]/g, '').slice(0, 4);
                                  setYears((p) => ({ ...p, [t.id]: y }));
                                  setMonths((p) => {
                                    const m = p[t.id];
                                    return m && Number(m) > maxMonthFor(y)
                                      ? { ...p, [t.id]: '' }
                                      : p;
                                  });
                                }}
                                className="w-16 rounded-md border border-transparent bg-neutral-800/60 px-2 py-1 text-sm text-neutral-200 [appearance:textfield] hover:border-neutral-700 focus:border-brand focus:bg-neutral-800 focus:outline-none"
                              />
                            </div>
                          </td>
                          <td className="px-2 py-2 text-right">
                            <button
                              type="button"
                              title="Resetear (recalcular sola)"
                              onClick={() => resetRow(t.id)}
                              className="rounded-md bg-neutral-800 px-2 py-1 text-neutral-400 transition hover:bg-neutral-700 hover:text-neutral-100"
                            >
                              ↻
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {shown.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-neutral-500">
                          {onlyIncomplete
                            ? 'Todas las canciones ya tienen mes.'
                            : 'No hay canciones.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {err && <p className="mt-2 text-sm text-red-300">{err}</p>}

              <div className="mt-4 flex items-center justify-between">
                <span className="text-sm text-neutral-400">
                  {changed} con cambios
                </span>
                <div className="flex gap-2">
                  <Button variant="ghost" disabled={save.isPending} onClick={onClose}>
                    Cancelar
                  </Button>
                  <Button
                    disabled={save.isPending || changed === 0}
                    onClick={() => {
                      setErr(null);
                      save.mutate();
                    }}
                  >
                    {save.isPending ? 'Guardando…' : `Guardar (${changed})`}
                  </Button>
                </div>
              </div>
            </>
          )
        )}
      </div>
    </div>
  );
}
