'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AcademyVideoDto } from '@baile-latino/types';
import { ApiError } from '@/lib/api';
import { academiesApi, formatVideoDuration } from '@/lib/academies';
import { textareaClass } from './academy-form';
import { Button, Spinner, StyleBadge } from './ui';

/**
 * Visor de la galería de una academia: reproduce el video o muestra la foto en
 * grande (URL firmada de 1 h), con ← → para pasar al anterior/siguiente y un
 * botón para reportar.
 */
export function AcademyVideoPlayer({
  academyId,
  items,
  index,
  onIndex,
  onClose,
}: {
  academyId: string;
  items: AcademyVideoDto[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const item = items[index];
  const url = useQuery({
    queryKey: ['academies', 'media-url', item.id],
    queryFn: () => academiesApi.videoUrl(academyId, item.id),
    staleTime: 50 * 60 * 1000, // la URL dura 1 h
    refetchOnWindowFocus: false,
  });
  const [playError, setPlayError] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('');
  const [reportState, setReportState] = useState<'idle' | 'sending' | 'sent' | string>('idle');
  const hasPrev = index > 0;
  const hasNext = index < items.length - 1;
  const isPhoto = item.kind === 'PHOTO';

  // Al cambiar de archivo se limpia el estado del anterior.
  useEffect(() => {
    setPlayError(false);
    setReporting(false);
    setReason('');
    setReportState('idle');
  }, [item.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && hasPrev) onIndex(index - 1);
      else if (e.key === 'ArrowRight' && hasNext) onIndex(index + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onIndex, index, hasPrev, hasNext]);

  const sendReport = async () => {
    setReportState('sending');
    try {
      await academiesApi.reportVideo(academyId, item.id, reason.trim());
      setReportState('sent');
    } catch (e) {
      setReportState(e instanceof ApiError ? e.message : 'No se pudo enviar el reporte.');
    }
  };

  const navBtn =
    'absolute top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/60 px-3 py-2 text-xl text-white hover:bg-black/80';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/80 p-4" onClick={onClose}>
      <div
        className="w-full max-w-4xl space-y-3 rounded-xl border border-neutral-800 bg-neutral-900 p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold">{item.title}</h2>
            <p className="text-xs text-neutral-400">
              {[
                item.classTitle,
                item.recordedOn,
                formatVideoDuration(item.durationMs),
                `subido por ${item.uploadedByName}`,
                items.length > 1 ? `${index + 1} de ${items.length}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-xl leading-none text-neutral-400 hover:text-neutral-100">
            ✕
          </button>
        </div>

        <div className="relative overflow-hidden rounded-lg bg-black">
          {hasPrev && (
            <button type="button" className={`${navBtn} left-2`} onClick={() => onIndex(index - 1)} aria-label="Anterior">
              ‹
            </button>
          )}
          {hasNext && (
            <button type="button" className={`${navBtn} right-2`} onClick={() => onIndex(index + 1)} aria-label="Siguiente">
              ›
            </button>
          )}
          {url.isLoading && (
            <div className="flex aspect-video items-center justify-center">
              <Spinner label={isPhoto ? 'Cargando foto…' : 'Cargando video…'} />
            </div>
          )}
          {url.isError && <p className="p-6 text-sm text-red-300">No se pudo cargar el archivo.</p>}
          {url.data &&
            (isPhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url.data.url} alt={item.title} className="mx-auto max-h-[75vh] w-auto max-w-full object-contain" />
            ) : (
              <video
                key={url.data.url}
                src={url.data.url}
                poster={item.thumbUrl ?? undefined}
                controls
                autoPlay
                playsInline
                controlsList="nodownload"
                onError={() => setPlayError(true)}
                className="mx-auto max-h-[70vh] w-full"
              />
            ))}
        </div>
        {playError && (
          <p className="text-xs text-amber-300">
            Tu navegador no puede reproducir este video (suele pasar con videos HEVC del iPhone en Chrome/Windows). Prueba en
            Safari o en el celular.
          </p>
        )}

        {(item.style || item.description) && (
          <div className="space-y-1">
            {item.style && <StyleBadge style={item.style} />}
            {item.description && <p className="whitespace-pre-line text-sm text-neutral-300">{item.description}</p>}
          </div>
        )}

        <div className="border-t border-neutral-800 pt-3 text-xs">
          {reportState === 'sent' ? (
            <p className="text-neutral-400">Gracias. Lo revisaremos.</p>
          ) : reporting ? (
            <div className="space-y-2">
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                className={textareaClass}
                placeholder="¿Por qué lo reportas? Ej.: aparezco sin haber dado permiso."
              />
              {reportState !== 'idle' && reportState !== 'sending' && <p className="text-red-300">{reportState}</p>}
              <div className="flex gap-2">
                <Button size="sm" variant="danger" onClick={sendReport} disabled={reason.trim().length < 5 || reportState === 'sending'}>
                  Enviar reporte
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setReporting(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setReporting(true)} className="text-neutral-500 hover:text-red-300">
              ⚑ Reportar {isPhoto ? 'foto' : 'video'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
