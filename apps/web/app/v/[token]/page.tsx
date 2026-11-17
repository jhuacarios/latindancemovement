'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { regionName } from '@baile-latino/types';
import { ApiError } from '@/lib/api';
import {
  LEVEL_LABEL,
  WEEKDAYS,
  academyLogoUrl,
  classTimeRange,
  formatBytes,
  formatVideoDuration,
  hasMp4,
  missingExtension,
  sharedApi,
  type DownloadFormat,
} from '@/lib/academies';
import { AcademyVideoPlayer } from '@/components/academy-video-player';
import { BrandLogo, Wordmark } from '@/components/brand';
import { InstagramLink } from '@/components/instagram-link';
import { Spinner, StyleBadge } from '@/components/ui';

/**
 * Página PÚBLICA (sin sesión) de un link compartido: las fotos y videos de una
 * clase de una academia, para ver y descargar.
 */
export default function SharedClassPage() {
  const { token } = useParams<{ token: string }>();
  const [playing, setPlaying] = useState<number | null>(null);
  const q = useQuery({ queryKey: ['shared', token], queryFn: () => sharedApi.get(token), retry: false });

  const download = async (videoId: string, format: DownloadFormat = 'original') => {
    const { url } = await sharedApi.downloadUrl(token, videoId, format);
    window.location.href = url;
  };

  const d = q.data;
  const logo = d ? academyLogoUrl({ id: d.academy.id, hasLogo: d.academy.hasLogo }) : null;

  return (
    <main className="mx-auto min-h-screen max-w-6xl space-y-6 px-4 py-6 text-neutral-200 sm:px-6">
      <header className="flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 text-lg">
          <BrandLogo className="h-7 w-7" />
          <Wordmark />
        </Link>
      </header>

      {q.isLoading && <Spinner label="Cargando…" />}
      {q.isError && (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-6 text-center">
          <div className="mb-2 text-4xl">🔒</div>
          <p className="text-neutral-300">
            {q.error instanceof ApiError && q.error.status === 404
              ? 'Este link no existe o fue desactivado por la academia.'
              : 'No se pudo cargar. Intenta de nuevo en un momento.'}
          </p>
        </div>
      )}

      {d && (
        <>
          <section className="flex flex-wrap items-start gap-4">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-neutral-800">
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-2xl">🎓</div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-neutral-400">
                {d.academy.name}
                {d.academy.city && ` · ${d.academy.city}`} · {regionName(d.academy.region)}
                {d.academy.instagramHandle && (
                  <span className="ml-2 inline-block align-middle">
                    <InstagramLink handle={d.academy.instagramHandle} />
                  </span>
                )}
              </p>
              <h1 className="text-2xl font-bold">{d.class.title}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-neutral-400">
                <span className="text-brand">
                  {WEEKDAYS[d.class.weekday]} {classTimeRange(d.class)}
                </span>
                {d.class.style && <StyleBadge style={d.class.style} />}
                <span>{LEVEL_LABEL[d.class.level]}</span>
                {d.class.teacherName && <span>· {d.class.teacherName}</span>}
              </div>
            </div>
          </section>

          <p className="text-sm text-neutral-400">
            {d.items.length === 0
              ? 'Esta clase todavía no tiene fotos ni videos.'
              : `${d.items.length} ${d.items.length === 1 ? 'archivo' : 'archivos'}: toca para ver, o descárgalos en su calidad original.`}
          </p>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {d.items.map((v, i) => (
              <div key={v.id} className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/60">
                <button
                  type="button"
                  onClick={() => setPlaying(i)}
                  className="group relative block aspect-video w-full bg-neutral-800"
                >
                  {v.thumbUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={v.thumbUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <span className="flex h-full items-center justify-center text-3xl">{v.kind === 'PHOTO' ? '🖼️' : '🎬'}</span>
                  )}
                  <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-4xl text-white/0 transition group-hover:bg-black/40 group-hover:text-white/90">
                    {v.kind === 'PHOTO' ? '⤢' : '▶'}
                  </span>
                  {v.durationMs !== null && (
                    <span className="absolute bottom-1.5 right-1.5 rounded bg-black/75 px-1.5 py-0.5 text-[11px] text-white">
                      {formatVideoDuration(v.durationMs)}
                    </span>
                  )}
                </button>
                <div className="space-y-0.5 p-3">
                  <div className="line-clamp-2 break-all text-sm font-medium">
                    {v.title}
                    <span className="text-neutral-500">{missingExtension(v)}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-neutral-400">
                    {v.recordedOn && <span>{v.recordedOn}</span>}
                    <span className="text-neutral-500">{formatBytes(v.sizeBytes)}</span>
                    {v.kind === 'VIDEO' && hasMp4(v) ? (
                      <>
                        <button type="button" onClick={() => void download(v.id, 'mp4')} className="text-brand hover:underline">
                          ⬇ MP4
                        </button>
                        {v.mimeType !== 'video/mp4' && (
                          <button
                            type="button"
                            onClick={() => void download(v.id)}
                            className="text-neutral-400 hover:text-neutral-200"
                            title="El archivo tal como se grabó (puede no verse en todos los equipos)"
                          >
                            Original
                          </button>
                        )}
                      </>
                    ) : (
                      <button type="button" onClick={() => void download(v.id)} className="text-brand hover:underline">
                        ⬇ Descargar
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <p className="pt-4 text-center text-xs text-neutral-600">
            Compartido por {d.academy.name} a través de Nectason.
          </p>

          {playing !== null && d.items[playing] && (
            <AcademyVideoPlayer
              academyId={d.academy.id}
              items={d.items}
              index={playing}
              onIndex={setPlaying}
              onClose={() => setPlaying(null)}
              urlFor={(videoId) => sharedApi.viewUrl(token, videoId)}
              onDownload={download}
              allowReport={false}
            />
          )}
        </>
      )}
    </main>
  );
}
