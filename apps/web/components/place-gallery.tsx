'use client';

import { useEffect, useRef, useState } from 'react';
import { COMMUNITY_PLACE_GALLERY_MAX, type CommunityPlaceDto } from '@baile-latino/types';
import { ApiError } from '@/lib/api';
import { compressImage } from '@/lib/image-compress';
import { addGalleryPhoto, galleryPhotoUrl, removeGalleryPhoto } from '@/lib/community-places';
import { Button } from '@/components/ui';

const ACCEPT = 'image/jpeg,image/png,image/webp';

/**
 * Galería 3×3 del lugar. Tocar una foto la abre en grande (flechas / Esc).
 * Quien puede editar agrega varias de una vez (se comprimen en el navegador)
 * o quita con la ×.
 */
export function PlaceGallery({
  place,
  canEdit,
  onChange,
}: {
  place: CommunityPlaceDto;
  canEdit: boolean;
  onChange: (p: CommunityPlaceDto) => void;
}) {
  const ids = place.galleryIds;
  const free = COMMUNITY_PLACE_GALLERY_MAX - ids.length;
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const list = Array.from(files).slice(0, free);
    setError(
      files.length > free
        ? `Solo caben ${free} foto${free === 1 ? '' : 's'} más (máximo ${COMMUNITY_PLACE_GALLERY_MAX}).`
        : null,
    );
    let last: CommunityPlaceDto | null = null;
    try {
      for (const [i, f] of list.entries()) {
        setBusy(`Subiendo ${i + 1} de ${list.length}…`);
        const { file } = await compressImage(f, 1280);
        last = await addGalleryPhoto(place.id, file);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'No se pudo subir.');
    } finally {
      if (last) onChange(last);
      setBusy(null);
      if (input.current) input.current.value = '';
    }
  }

  async function remove(photoId: string) {
    setBusy('Quitando…');
    setError(null);
    try {
      onChange(await removeGalleryPhoto(place.id, photoId));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo quitar.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      {ids.length > 0 && (
        <div className="grid grid-cols-3 gap-1 overflow-hidden rounded-xl">
          {ids.map((pid, i) => (
            <div key={pid} className="group relative aspect-square bg-neutral-800">
              <button
                type="button"
                onClick={() => setOpen(i)}
                className="block h-full w-full"
                aria-label={`Ver foto ${i + 1}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={galleryPhotoUrl(place.id, pid)}
                  alt=""
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </button>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => void remove(pid)}
                  disabled={Boolean(busy)}
                  aria-label="Quitar foto"
                  className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-sm text-white hover:bg-red-600"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {canEdit && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-400">
          <input
            ref={input}
            type="file"
            accept={ACCEPT}
            multiple
            hidden
            onChange={(e) => void upload(e.target.files)}
          />
          <Button
            type="button"
            variant="ghost"
            disabled={free <= 0 || Boolean(busy)}
            onClick={() => input.current?.click()}
          >
            {busy ?? (ids.length ? '+ Agregar fotos' : '+ Agregar fotos a la galería')}
          </Button>
          <span>
            {ids.length}/{COMMUNITY_PLACE_GALLERY_MAX} fotos
            {ids.length === 0 && ' · por ejemplo, tus últimos posts de Instagram'}
          </span>
        </div>
      )}
      {error && <p className="text-sm text-red-300">{error}</p>}

      {open !== null && ids[open] && (
        <Lightbox
          urls={ids.map((pid) => galleryPhotoUrl(place.id, pid))}
          index={open}
          onIndex={setOpen}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

function Lightbox({
  urls,
  index,
  onIndex,
  onClose,
}: {
  urls: string[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const prev = () => onIndex((index - 1 + urls.length) % urls.length);
  const next = () => onIndex((index + 1) % urls.length);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const nav =
    'absolute top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-2xl text-white hover:bg-black/80';
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={urls[index]}
        alt=""
        className="max-h-full max-w-full rounded-lg object-contain"
        onClick={(e) => e.stopPropagation()}
      />
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar"
        className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-xl text-white hover:bg-black/80"
      >
        ×
      </button>
      {urls.length > 1 && (
        <>
          <button
            type="button"
            aria-label="Anterior"
            className={`${nav} left-3`}
            onClick={(e) => {
              e.stopPropagation();
              prev();
            }}
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="Siguiente"
            className={`${nav} right-3`}
            onClick={(e) => {
              e.stopPropagation();
              next();
            }}
          >
            ›
          </button>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-sm text-neutral-300">
            {index + 1} / {urls.length}
          </div>
        </>
      )}
    </div>
  );
}
