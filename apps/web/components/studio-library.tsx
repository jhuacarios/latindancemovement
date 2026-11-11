'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AudioFileStatus, AudioFileSummary, DanceStyle } from '@baile-latino/types';
import { ApiError } from '@/lib/api';
import { IN_PROGRESS, formatDuration, studioApi } from '@/lib/studio';
import { Card, DeleteIconButton, Spinner } from '@/components/ui';
import { clsx } from '@/components/clsx';
import { StudioUpload } from '@/components/studio-upload';

const STATUS_LABEL: Record<AudioFileStatus, string> = {
  UPLOADING: 'Subiendo',
  QUEUED: 'En cola',
  PROCESSING: 'Analizando…',
  READY: 'Listo',
  ERROR: 'Error',
};

function StatusBadge({ status }: { status: AudioFileStatus }) {
  return (
    <span
      className={clsx(
        'rounded-full px-2 py-0.5 text-xs font-medium',
        status === 'READY' && 'bg-son/30 text-nectar',
        status === 'ERROR' && 'bg-red-500/15 text-red-300',
        IN_PROGRESS.has(status) && 'animate-pulse bg-neutral-800 text-neutral-300',
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function AudioRow({
  file,
  href,
  onDelete,
}: {
  file: AudioFileSummary;
  href: string;
  onDelete: () => void;
}) {
  const ready = file.status === 'READY';
  const body = (
    <div className="min-w-0 flex-1">
      <div className="truncate font-medium">{file.originalName}</div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-400">
        <StatusBadge status={file.status} />
        {file.bpm !== null && <span>{Math.round(file.bpm)} BPM</span>}
        <span>{formatDuration(file.durationMs)}</span>
      </div>
      {file.error && <p className="mt-1 text-xs text-red-300">{file.error}</p>}
    </div>
  );
  return (
    <li className="flex items-center gap-3 rounded-lg border border-neutral-800 px-4 py-3">
      {ready ? (
        <Link href={href} className="min-w-0 flex-1 hover:text-clave">
          {body}
        </Link>
      ) : (
        body
      )}
      <DeleteIconButton
        aria-label={`Borrar ${file.originalName}`}
        title="Borrar audio y análisis"
        onClick={onDelete}
      />
    </li>
  );
}

/** Lista + subida de canciones de un estilo del Estudio (Estudio → Bachata, Salsa…). */
export function StudioLibrary({
  style,
  basePath,
  title,
  description,
}: {
  style: DanceStyle;
  basePath: string;
  title: string;
  description: string;
}) {
  const qc = useQueryClient();
  const queryKey = ['studio', 'audio-files', style];
  const { data, isLoading, isError, error } = useQuery({
    queryKey,
    queryFn: () => studioApi.list(style),
    // Mientras haya algo analizándose, refresca cada 3 s.
    refetchInterval: (q) =>
      q.state.data?.some((f) => IN_PROGRESS.has(f.status)) ? 3000 : false,
  });

  const remove = useMutation({
    mutationFn: studioApi.remove,
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  function confirmDelete(file: AudioFileSummary) {
    if (window.confirm(`¿Borrar "${file.originalName}"? Se eliminan el audio, su análisis y tus notas.`)) {
      remove.mutate(file.id);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="text-sm text-neutral-400">{description}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <StudioUpload style={style} onUploaded={() => qc.invalidateQueries({ queryKey })} />

        <section className="space-y-3">
          <h2 className="font-semibold">Mis canciones</h2>
          {isLoading && <Spinner label="Cargando…" />}
          {isError && (
            <Card className="text-sm text-red-300">
              {error instanceof ApiError ? error.message : 'No se pudo cargar el Estudio.'}
            </Card>
          )}
          {data?.length === 0 && (
            <p className="text-sm text-neutral-500">Todavía no subes canciones.</p>
          )}
          {data && data.length > 0 && (
            <ul className="space-y-2">
              {data.map((f) => (
                <AudioRow
                  key={f.id}
                  file={f}
                  href={`${basePath}/${f.id}`}
                  onDelete={() => confirmDelete(f)}
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
