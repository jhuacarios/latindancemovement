'use client';

import { useEffect, useState } from 'react';
import {
  DANCE_STYLES,
  type DanceStyle,
  type TrackSource,
} from '@baile-latino/types';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button, Input, Select } from './ui';
import { clsx } from './clsx';
import { SubstyleMultiSelect } from './substyle-select';

type Destination = 'library' | 'catalog';

export interface VideoToAdd {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string | null;
  /** Año (opcional, se guarda si viene — p.ej. desde Spotify). */
  year?: number | null;
}

/**
 * Modal para agregar un video de YouTube (sin match) al sistema. Por defecto
 * crea una canción personal en "Mis Canciones". El SUPER_ADMIN puede además
 * elegir agregarla al catálogo global (compartida y categorizada).
 */
export function AddVideoToLibraryModal({
  video,
  source = 'YOUTUBE',
  startInCatalog = false,
  onClose,
  onAdded,
}: {
  video: VideoToAdd;
  /** Fuente de la canción (YOUTUBE por defecto). */
  source?: TrackSource;
  /** Abre el modal con el destino "Catálogo" preseleccionado (solo super admin). */
  startInCatalog?: boolean;
  onClose: () => void;
  onAdded: (destination: Destination) => void;
}) {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const [title, setTitle] = useState(video.title);
  const [artist, setArtist] = useState(video.channelTitle);
  const [style, setStyle] = useState<DanceStyle | ''>('');
  const [substyles, setSubstyles] = useState<string[]>([]);
  const [destination, setDestination] = useState<Destination>(
    startInCatalog && isSuperAdmin ? 'catalog' : 'library',
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !saving && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  async function save() {
    if (!title.trim() || !artist.trim()) {
      setErr('Completa título y artista.');
      return;
    }
    if (!style) {
      setErr('Elige un estilo.');
      return;
    }
    setErr(null);
    setSaving(true);
    // Catálogo (solo super admin) o canción personal en Mis Canciones.
    const dest: Destination = isSuperAdmin ? destination : 'library';
    const endpoint = dest === 'catalog' ? '/music/tracks' : '/music/library/personal';
    try {
      await api(endpoint, {
        method: 'POST',
        body: {
          title: title.trim(),
          artist: artist.trim(),
          style,
          substyles,
          source,
          sourceId: video.videoId,
          coverUrl: video.thumbnailUrl ?? undefined,
          year: video.year ?? undefined,
        },
      });
      onAdded(dest);
      onClose();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'No se pudo agregar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={() => !saving && onClose()}
    >
      <div
        className="w-full max-w-md rounded-xl border border-neutral-800 bg-neutral-900 p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">
            {isSuperAdmin && destination === 'catalog'
              ? 'Agregar al Catálogo'
              : 'Agregar a Mis Canciones'}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg bg-neutral-800 px-2 py-1 text-sm hover:bg-neutral-700"
          >
            ✕
          </button>
        </div>

        <div className="space-y-3">
          {isSuperAdmin && (
            <div>
              <label className="mb-1 block text-xs text-neutral-400">
                Destino
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ['library', 'Mis Canciones', 'Personal, solo tú'],
                    ['catalog', 'Catálogo', 'Compartida, global'],
                  ] as const
                ).map(([val, label, hint]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setDestination(val)}
                    className={clsx(
                      'rounded-lg border px-3 py-2 text-left text-sm transition',
                      destination === val
                        ? 'border-brand bg-brand/10 text-brand'
                        : 'border-neutral-700 bg-neutral-800/40 text-neutral-300 hover:border-neutral-600',
                    )}
                  >
                    <div className="font-medium">{label}</div>
                    <div className="text-[10px] opacity-70">{hint}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs text-neutral-400">Título</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-400">Artista</label>
            <Input value={artist} onChange={(e) => setArtist(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-400">Estilo</label>
            <Select
              value={style}
              onChange={(e) => {
                setStyle(e.target.value as DanceStyle | '');
                setSubstyles([]);
              }}
            >
              <option value="">Selecciona un estilo…</option>
              {DANCE_STYLES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-400">
              Sub-estilos
            </label>
            <SubstyleMultiSelect
              style={style}
              value={substyles}
              onChange={setSubstyles}
            />
          </div>

          {err && (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {err}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" disabled={saving} onClick={onClose}>
              Cancelar
            </Button>
            <Button disabled={saving} onClick={save}>
              {saving
                ? 'Agregando…'
                : isSuperAdmin && destination === 'catalog'
                  ? 'Agregar al Catálogo'
                  : 'Agregar a Mis Canciones'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
