'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/lib/api';
import { INSTRUMENTS_IN_PROGRESS, IN_PROGRESS, formatDuration, studioApi } from '@/lib/studio';
import { Button, Card, Spinner } from '@/components/ui';
import { StudioPlayer } from '@/components/studio-player';

export default function StudioBachataSongPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();

  const study = useQuery({
    queryKey: ['studio', 'audio-file', id],
    queryFn: () => studioApi.get(id),
    refetchInterval: (q) => {
      const d = q.state.data;
      if (!d) return false;
      if (IN_PROGRESS.has(d.status)) return 3000;
      // La detección de instrumentos tarda un par de minutos: se consulta más espaciado.
      if (d.instrumentsStatus && INSTRUMENTS_IN_PROGRESS.has(d.instrumentsStatus)) return 10_000;
      return false;
    },
  });

  // La URL firmada dura 1 h: se reutiliza 50 min y no se refresca sola (cortaría la reproducción).
  const audio = useQuery({
    queryKey: ['studio', 'audio-url', id],
    queryFn: () => studioApi.playbackUrl(id),
    enabled: study.data?.status === 'READY',
    staleTime: 50 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const firstBeat = useMutation({
    mutationFn: (timeMs: number | null) => studioApi.setFirstBeat(id, timeMs),
    onSuccess: (updated) => qc.setQueryData(['studio', 'audio-file', id], updated),
  });

  const reanalyze = useMutation({
    mutationFn: () => studioApi.reanalyze(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['studio'] }),
  });

  const s = study.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/studio/bachata" className="text-sm text-neutral-400 hover:text-clave">
            ← Estudio · Bachata
          </Link>
          <h1 className="mt-1 truncate text-2xl font-bold">{s?.originalName ?? 'Canción'}</h1>
          {s && (
            <p className="text-sm text-neutral-400">
              {s.bpm !== null && `${Math.round(s.bpm)} BPM · `}
              {formatDuration(s.durationMs)} · {s.phraseStartIndexes.length} frases de 8
            </p>
          )}
        </div>
        {s && (s.status === 'READY' || s.status === 'ERROR') && (
          <Button variant="ghost" size="sm" onClick={() => reanalyze.mutate()} disabled={reanalyze.isPending}>
            Re-analizar
          </Button>
        )}
      </div>

      {study.isLoading && <Spinner label="Cargando canción…" />}
      {study.isError && (
        <Card className="text-sm text-red-300">
          {study.error instanceof ApiError ? study.error.message : 'No se pudo cargar la canción.'}
        </Card>
      )}
      {s && IN_PROGRESS.has(s.status) && <Spinner label="Analizando la canción… (menos de un minuto)" />}
      {s?.status === 'ERROR' && <Card className="text-sm text-red-300">{s.error}</Card>}
      {firstBeat.isError && (
        <p className="text-sm text-red-300">
          {firstBeat.error instanceof ApiError ? firstBeat.error.message : 'No se pudo guardar el 1.'}
        </p>
      )}

      {s?.status === 'READY' && audio.data && (
        <StudioPlayer
          study={s}
          audioUrl={audio.data.url}
          onSetFirstBeat={(t) => firstBeat.mutate(t)}
          savingFirstBeat={firstBeat.isPending}
        />
      )}
    </div>
  );
}
