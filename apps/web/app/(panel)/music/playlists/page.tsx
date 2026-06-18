'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Playlist,
  PlaylistGenerationResult,
} from '@baile-latino/types';
import { api, ApiError } from '@/lib/api';
import { Button, Card, Input, Spinner, StyleBadge } from '@/components/ui';

export default function PlaylistsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['playlists'],
    queryFn: () => api<Playlist[]>('/music/playlists'),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Playlists</h1>
        <p className="text-sm text-neutral-400">
          Genera listas automáticas o revisa las guardadas.
        </p>
      </div>

      <Generator />

      <div>
        <h2 className="mb-3 font-semibold">Mis playlists</h2>
        {isLoading && <Spinner />}
        {data && data.length === 0 && (
          <p className="text-sm text-neutral-500">
            Aún no tienes playlists guardadas. Genera una arriba (ponle nombre para guardarla).
          </p>
        )}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {data?.map((p) => (
            <Link key={p.id} href={`/music/playlists/${p.id}`}>
              <Card className="h-full transition hover:border-brand/60">
                <div className="font-semibold">{p.name}</div>
                <div className="mt-1 text-sm text-neutral-400">
                  {p.items?.length ?? 0} canciones · {p.status}
                </div>
                {p.targetBachataPct != null && (
                  <div className="mt-2 text-xs text-neutral-500">
                    Mix objetivo: {p.targetBachataPct}% bachata
                  </div>
                )}
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function Generator() {
  const qc = useQueryClient();
  const [bachataPct, setBachataPct] = useState(50);
  const [maxTracks, setMaxTracks] = useState(20);
  const [bpmMin, setBpmMin] = useState('');
  const [bpmMax, setBpmMax] = useState('');
  const [byPopularity, setByPopularity] = useState(false);
  const [name, setName] = useState('');
  const [result, setResult] = useState<PlaylistGenerationResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      api<PlaylistGenerationResult>('/music/playlists/generate', {
        method: 'POST',
        body: {
          bachataPct,
          maxTracks,
          bpmMin: bpmMin ? Number(bpmMin) : undefined,
          bpmMax: bpmMax ? Number(bpmMax) : undefined,
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

  return (
    <Card>
      <h2 className="mb-4 font-semibold">🎲 Generador automático</h2>
      <form
        className="grid grid-cols-1 gap-4 md:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          setErr(null);
          mutation.mutate();
        }}
      >
        <div>
          <label className="mb-1 block text-sm text-neutral-300">
            Mezcla: {bachataPct}% bachata / {100 - bachataPct}% salsa
          </label>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={bachataPct}
            onChange={(e) => setBachataPct(Number(e.target.value))}
            className="w-full accent-[var(--color-brand)]"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-neutral-300">
            Máx. canciones: {maxTracks}
          </label>
          <input
            type="range"
            min={5}
            max={60}
            step={1}
            value={maxTracks}
            onChange={(e) => setMaxTracks(Number(e.target.value))}
            className="w-full accent-[var(--color-brand)]"
          />
        </div>
        <div className="flex gap-3">
          <div>
            <label className="mb-1 block text-xs text-neutral-400">BPM mín.</label>
            <Input
              type="number"
              value={bpmMin}
              onChange={(e) => setBpmMin(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-400">BPM máx.</label>
            <Input
              type="number"
              value={bpmMax}
              onChange={(e) => setBpmMax(e.target.value)}
            />
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

        <div className="md:col-span-2">
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Generando…' : 'Generar playlist'}
          </Button>
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
                <StyleBadge style={t.substyle ?? t.style} />
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
