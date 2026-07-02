'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Playlist,
  PlaylistGenerationResult,
} from '@baile-latino/types';
import { api, ApiError } from '@/lib/api';
import { Button, Card, Input, Spinner, StyleBadge } from '@/components/ui';
import { PlatformIcon } from '@/components/platform-icon';
import { ConfirmDialog, type ConfirmOptions } from '@/components/confirm-dialog';
import { clsx } from '@/components/clsx';

/**
 * Lista de playlists internas de una plataforma (YouTube o Spotify). Cada
 * plataforma tiene sus propias playlists internas; no se mezclan.
 */
export function InternalPlaylistsView({
  source,
}: {
  source: 'YOUTUBE' | 'SPOTIFY';
}) {
  const isSpotify = source === 'SPOTIFY';
  const qc = useQueryClient();
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['playlists', source],
    queryFn: () => api<Playlist[]>(`/music/playlists?source=${source}`),
  });

  const del = useMutation({
    mutationFn: async (ids: string[]) => {
      let failed = 0;
      for (const id of ids) {
        try {
          await api(`/music/playlists/${id}`, { method: 'DELETE' });
        } catch {
          failed++;
        }
      }
      return failed;
    },
    onSuccess: async (failed) => {
      setSelected(new Set());
      setSelectMode(false);
      await qc.invalidateQueries({ queryKey: ['playlists'] });
      setErr(failed ? `${failed} playlist(s) no se pudieron eliminar.` : null);
    },
    onError: (e) =>
      setErr(e instanceof ApiError ? e.message : 'No se pudo eliminar.'),
  });

  const busy = del.isPending;
  const items = data ?? [];

  function deleteOne(p: Playlist) {
    setConfirm({
      title: 'Eliminar playlist',
      danger: true,
      confirmLabel: 'Eliminar',
      message: (
        <>
          ¿Eliminar la playlist <b className="text-neutral-100">{p.name}</b>?
          Esta acción no se puede deshacer.
        </>
      ),
      onConfirm: () => {
        setErr(null);
        del.mutate([p.id]);
      },
    });
  }

  function deleteSelected() {
    const ids = [...selected];
    if (!ids.length) return;
    setConfirm({
      title: 'Eliminar playlists',
      danger: true,
      confirmLabel: `Eliminar ${ids.length}`,
      message: (
        <>
          ¿Eliminar{' '}
          <b className="text-neutral-100">
            {ids.length} playlist{ids.length === 1 ? '' : 's'}
          </b>
          ? Esta acción no se puede deshacer.
        </>
      ),
      onConfirm: () => {
        setErr(null);
        del.mutate(ids);
      },
    });
  }

  function toggle(id: string) {
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <PlatformIcon source={source} className="h-6 w-6 shrink-0" /> Playlists
          Internas
          <span className="text-sm font-normal text-neutral-500">
            ({isSpotify ? 'Spotify' : 'YouTube'})
          </span>
        </h1>
        <p className="text-sm text-neutral-400">
          Playlists de la plataforma, asociadas a tu cuenta. Genera listas
          automáticas o revisa las guardadas.
        </p>
      </div>

      <Generator source={source} />

      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Mis playlists</h2>
          {items.length > 0 && (
            <div className="flex items-center gap-2">
              {!selectMode ? (
                <Button variant="ghost" onClick={() => setSelectMode(true)}>
                  ☑️ Seleccionar
                </Button>
              ) : (
                <>
                  <span className="text-sm text-neutral-400">
                    {selected.size} seleccionada{selected.size === 1 ? '' : 's'}
                  </span>
                  <Button
                    variant="danger"
                    disabled={selected.size === 0 || busy}
                    onClick={deleteSelected}
                  >
                    {busy ? 'Eliminando…' : `🗑 Eliminar (${selected.size})`}
                  </Button>
                  <Button variant="ghost" disabled={busy} onClick={exitSelect}>
                    Cancelar
                  </Button>
                </>
              )}
            </div>
          )}
        </div>

        {err && <Card className="mb-3 text-sm text-red-300">{err}</Card>}
        {isLoading && <Spinner />}
        {!isLoading && items.length === 0 && (
          <p className="text-sm text-neutral-500">
            Aún no tienes playlists guardadas. Genera una arriba (ponle nombre para guardarla).
          </p>
        )}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {items.map((p) => {
            const isSelected = selected.has(p.id);
            const inner = (
              <Card
                className={clsx(
                  'relative h-full transition',
                  selectMode
                    ? isSelected
                      ? 'border-brand ring-1 ring-brand'
                      : 'hover:border-neutral-600'
                    : 'hover:border-brand/60',
                )}
              >
                {selectMode && (
                  <span
                    className={clsx(
                      'absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded border text-xs',
                      isSelected
                        ? 'border-brand bg-brand text-white'
                        : 'border-neutral-600 bg-neutral-900/80 text-transparent',
                    )}
                  >
                    ✓
                  </span>
                )}
                <div className={clsx('font-semibold', selectMode && 'pl-7')}>
                  {p.name}
                </div>
                <div className="mt-1 text-sm text-neutral-400">
                  {p.items?.length ?? 0} canciones
                </div>
                {p.targetBachataPct != null && (
                  <div className="mt-2 text-xs text-neutral-500">
                    Mix objetivo: {p.targetBachataPct}% bachata
                  </div>
                )}
                {p.bachatasPerBlock != null && p.salsasPerBlock != null && (
                  <div className="mt-1 text-[11px] text-neutral-500">
                    Patrón: {p.bachatasPerBlock} bachatas → {p.salsasPerBlock}{' '}
                    salsas por bloque
                  </div>
                )}

                {!selectMode && (
                  <button
                    type="button"
                    title="Eliminar playlist"
                    disabled={busy}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      deleteOne(p);
                    }}
                    className="absolute right-2 top-2 rounded-md bg-neutral-800/80 px-1.5 py-0.5 text-sm text-neutral-400 transition hover:bg-red-500/20 hover:text-red-300 disabled:opacity-50"
                  >
                    🗑
                  </button>
                )}
              </Card>
            );

            return selectMode ? (
              <button
                key={p.id}
                type="button"
                onClick={() => toggle(p.id)}
                className="text-left"
              >
                {inner}
              </button>
            ) : (
              <Link key={p.id} href={`/music/playlists/${p.id}`}>
                {inner}
              </Link>
            );
          })}
        </div>
      </div>

      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}

function Generator({ source }: { source: 'YOUTUBE' | 'SPOTIFY' }) {
  const qc = useQueryClient();
  const router = useRouter();
  const [bachatas, setBachatas] = useState<number | ''>(5);
  const [salsas, setSalsas] = useState<number | ''>(3);
  const [limitMode, setLimitMode] = useState<'count' | 'duration'>('count');
  const [maxTracks, setMaxTracks] = useState<number | ''>(30);
  const [minutes, setMinutes] = useState<number | ''>(60);
  const [byPopularity, setByPopularity] = useState(false);
  const [name, setName] = useState('');
  const [result, setResult] = useState<PlaylistGenerationResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const num = (v: number | '', min: number, fallback: number) =>
    v === '' ? fallback : Math.max(min, v);

  const mutation = useMutation({
    mutationFn: () =>
      api<PlaylistGenerationResult>('/music/playlists/generate', {
        method: 'POST',
        body: {
          source,
          bachataCount: bachatas === '' ? 0 : bachatas,
          salsaCount: salsas === '' ? 0 : salsas,
          maxTracks: limitMode === 'count' ? num(maxTracks, 1, 30) : undefined,
          targetMinutes:
            limitMode === 'duration' ? num(minutes, 5, 60) : undefined,
          byPopularity,
          name: name || undefined,
        },
      }),
    onSuccess: (res) => {
      setResult(res);
      if (res.playlist) void qc.invalidateQueries({ queryKey: ['playlists'] });
    },
    onError: (e) =>
      setErr(e instanceof ApiError ? e.message : 'No se pudo generar'),
  });

  const createEmpty = useMutation({
    mutationFn: () => {
      const b = bachatas === '' ? 0 : bachatas;
      const s = salsas === '' ? 0 : salsas;
      const pct = b + s > 0 ? Math.round((b / (b + s)) * 100) : undefined;
      return api<Playlist>('/music/playlists', {
        method: 'POST',
        body: {
          name: name.trim(),
          source,
          bachatasPerBlock: b,
          salsasPerBlock: s,
          targetBachataPct: pct,
        },
      });
    },
    onSuccess: (pl) => {
      void qc.invalidateQueries({ queryKey: ['playlists'] });
      router.push(`/music/playlists/${pl.id}`);
    },
    onError: (e) =>
      setErr(e instanceof ApiError ? e.message : 'No se pudo crear'),
  });

  function onCreateEmpty() {
    setErr(null);
    if (!name.trim()) {
      setErr('Ponle un nombre para crear la playlist vacía.');
      return;
    }
    createEmpty.mutate();
  }

  return (
    <Card>
      <h2 className="mb-1 font-semibold">🎲 Generador automático</h2>
      <p className="mb-4 text-xs text-neutral-500">
        Arma la lista con tus canciones de{' '}
        <strong>Mis Canciones ({source === 'SPOTIFY' ? 'Spotify' : 'YouTube'})</strong>,
        respetando el patrón por bloque.
      </p>
      <form
        className="grid grid-cols-1 gap-4 md:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          setErr(null);
          mutation.mutate();
        }}
      >
        <div className="md:col-span-2">
          <label className="mb-1 block text-xs text-neutral-400">
            Distribución por bloque (se repite el patrón hasta el límite)
          </label>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm text-neutral-300">
                Bachatas por bloque
              </label>
              <Input
                type="number"
                min={0}
                max={50}
                value={bachatas}
                onChange={(e) =>
                  setBachatas(
                    e.target.value === '' ? '' : Math.max(0, Number(e.target.value)),
                  )
                }
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-neutral-300">
                Salsas por bloque
              </label>
              <Input
                type="number"
                min={0}
                max={50}
                value={salsas}
                onChange={(e) =>
                  setSalsas(
                    e.target.value === '' ? '' : Math.max(0, Number(e.target.value)),
                  )
                }
              />
            </div>
          </div>
          <p className="mt-1 text-[11px] text-neutral-500">
            Patrón: {bachatas || 0} bachatas → {salsas || 0} salsas, repetido.
          </p>
        </div>

        <div className="md:col-span-2">
          <label className="mb-1 block text-xs text-neutral-400">Límite</label>
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-lg border border-neutral-700 p-0.5">
              {(['count', 'duration'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setLimitMode(m)}
                  className={clsx(
                    'rounded-md px-3 py-1 text-sm transition',
                    limitMode === m
                      ? 'bg-brand text-white'
                      : 'text-neutral-300 hover:bg-neutral-800',
                  )}
                >
                  {m === 'count' ? 'Por cantidad' : 'Por duración'}
                </button>
              ))}
            </div>

            {limitMode === 'count' ? (
              <label className="flex items-center gap-2 text-sm text-neutral-300">
                Máx. canciones:
                <span className="w-24">
                  <Input
                    type="number"
                    min={1}
                    max={300}
                    value={maxTracks}
                    onChange={(e) =>
                      setMaxTracks(
                        e.target.value === ''
                          ? ''
                          : Math.max(0, Number(e.target.value)),
                      )
                    }
                  />
                </span>
              </label>
            ) : (
              <label className="flex items-center gap-2 text-sm text-neutral-300">
                Máx. minutos:
                <span className="w-24">
                  <Input
                    type="number"
                    min={5}
                    max={600}
                    value={minutes}
                    onChange={(e) =>
                      setMinutes(
                        e.target.value === ''
                          ? ''
                          : Math.max(0, Number(e.target.value)),
                      )
                    }
                  />
                </span>
              </label>
            )}
          </div>
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm text-neutral-300">
            <input
              type="checkbox"
              checked={byPopularity}
              onChange={(e) => setByPopularity(e.target.checked)}
              className="accent-[var(--color-brand)]"
            />
            Priorizar más solicitadas (recomendación)
          </label>
        </div>
        <div className="md:col-span-2">
          <label className="mb-1 block text-xs text-neutral-400">
            Nombre (opcional — si lo pones, se guarda como playlist)
          </label>
          <Input
            placeholder="Ej: Social Viña - Sábado"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        {err && (
          <p className="md:col-span-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {err}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3 md:col-span-2">
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Generando…' : 'Generar playlist'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={createEmpty.isPending}
            onClick={onCreateEmpty}
          >
            {createEmpty.isPending ? 'Creando…' : '➕ Crear vacía (sin canciones)'}
          </Button>
          <span className="text-[11px] text-neutral-500">
            Crea la playlist solo con su distribución; la llenas tú después.
          </span>
        </div>
      </form>

      {result && (
        <div className="mt-5 border-t border-neutral-800 pt-4">
          <div className="mb-3 flex flex-wrap gap-4 text-sm text-neutral-400">
            <span>
              {result.summary.trackCount} canciones (~
              {result.summary.estimatedMinutes} min)
            </span>
            <span>Mix real: {result.summary.actualBachataPct}% bachata</span>
            {result.playlist && (
              <Link
                href={`/music/playlists/${result.playlist.id}`}
                className="text-brand hover:underline"
              >
                guardada ✓ ver detalle ↗
              </Link>
            )}
          </div>
          <ol className="space-y-1 text-sm">
            {result.tracks.map((t, i) => (
              <li key={t.id} className="flex items-center gap-2">
                <span className="w-6 text-right text-neutral-500">{i + 1}.</span>
                <StyleBadge style={t.style} />
                <span className="font-medium">{t.title}</span>
                <span className="text-neutral-500">— {t.artist}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </Card>
  );
}
