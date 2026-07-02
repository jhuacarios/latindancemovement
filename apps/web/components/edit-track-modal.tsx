'use client';

import { useEffect, useState } from 'react';
import {
  DANCE_STYLES,
  type DanceStyle,
  type ExtractedTrackMetadata,
  type Track,
  type YoutubeDetails,
} from '@baile-latino/types';
import { api, ApiError } from '@/lib/api';
import { Button, Input, Select } from './ui';
import { SubstyleMultiSelect } from './substyle-select';

/** Respuesta de /music/tracks/spotify-metadata (autocompletar desde Spotify). */
interface SpotifyMetaResp {
  title: string;
  artist: string | null;
  durationSec: number | null;
  year: number | null;
  coverUrl: string | null;
  detectedStyle: DanceStyle | null;
}

export function EditTrackModal({
  track,
  onClose,
  onSaved,
}: {
  track: Track;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    title: track.title,
    artist: track.artist,
    style: track.style,
    substyles: track.substyles ?? [],
    year: track.year != null ? String(track.year) : '',
    link: track.url,
    coverUrl: track.coverUrl ?? '',
  });
  const [ytDetails, setYtDetails] = useState<YoutubeDetails | null>(
    track.details ?? null,
  );
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  async function autofill() {
    const link = form.link.trim();
    if (!link) {
      setErr('Pega primero un link.');
      return;
    }
    setErr(null);
    setInfo(null);
    setFetching(true);
    try {
      if (/open\.spotify\.com|spotify:track/.test(link)) {
        const m = await api<SpotifyMetaResp>(
          `/music/tracks/spotify-metadata?link=${encodeURIComponent(link)}`,
        );
        setForm((f) => ({
          ...f,
          title: m.title || f.title,
          artist: m.artist ?? f.artist,
          style: m.detectedStyle ?? f.style,
          year: m.year ? String(m.year) : f.year,
          coverUrl: m.coverUrl ?? f.coverUrl,
        }));
        setYtDetails(null);
        const parts: string[] = ['Spotify'];
        if (m.detectedStyle) parts.push(`estilo: ${m.detectedStyle}`);
        if (m.durationSec) parts.push(`${Math.round(m.durationSec / 60)} min`);
        setInfo(`✓ Datos del link (${parts.join(' · ')}). Revisa y guarda.`);
        return;
      }
      const m = await api<ExtractedTrackMetadata>(
        `/music/tracks/metadata?link=${encodeURIComponent(link)}`,
      );
      setForm((f) => ({
        ...f,
        title: m.title || f.title,
        artist: m.artist ?? f.artist,
        style: m.detectedStyle ?? f.style,
        year: m.year ? String(m.year) : f.year,
        coverUrl: m.coverUrl ?? f.coverUrl,
      }));
      setYtDetails(m.details);
      const parts: string[] = [];
      if (m.detectedStyle) parts.push(`estilo: ${m.detectedStyle}`);
      if (m.durationSec) parts.push(`${Math.round(m.durationSec / 60)} min`);
      if (m.details?.viewCount)
        parts.push(`${Number(m.details.viewCount).toLocaleString()} vistas`);
      parts.push(m.via === 'youtube-api' ? 'YouTube API' : 'oEmbed');
      setInfo(`✓ Datos del link (${parts.join(' · ')}). Revisa y guarda.`);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'No se pudo leer el link');
    } finally {
      setFetching(false);
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function save() {
    setErr(null);
    setSaving(true);
    try {
      await api(`/music/tracks/${track.id}`, {
        method: 'PATCH',
        body: {
          title: form.title,
          artist: form.artist,
          style: form.style,
          substyles: form.substyles,
          year: form.year ? Number(form.year) : undefined,
          coverUrl: form.coverUrl || undefined,
          link: form.link || undefined,
          ytMetadata: ytDetails ? JSON.stringify(ytDetails) : undefined,
        },
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'No se pudo guardar');
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
        className="w-full max-w-lg rounded-xl border border-neutral-800 bg-neutral-900 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">Editar canción</h2>
          <button
            onClick={onClose}
            className="rounded-lg bg-neutral-800 px-2 py-1 text-sm hover:bg-neutral-700"
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs text-neutral-400">
              Link (YouTube/Spotify) — al cambiarlo puedes autocompletar
            </label>
            <div className="flex gap-2">
              <Input
                placeholder="https://youtu.be/… o https://open.spotify.com/track/…"
                value={form.link}
                onChange={(e) => setForm({ ...form, link: e.target.value })}
              />
              <Button
                type="button"
                variant="ghost"
                className="shrink-0"
                disabled={fetching}
                onClick={autofill}
              >
                {fetching ? 'Leyendo…' : '✨ Autocompletar'}
              </Button>
            </div>
            {info && <p className="mt-1 text-xs text-emerald-300">{info}</p>}
          </div>

          <Input
            placeholder="Título"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <Input
            placeholder="Artista"
            value={form.artist}
            onChange={(e) => setForm({ ...form, artist: e.target.value })}
          />
          <Select
            value={form.style}
            onChange={(e) =>
              setForm({ ...form, style: e.target.value as DanceStyle, substyles: [] })
            }
          >
            {DANCE_STYLES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
          <Input
            type="number"
            placeholder="Año"
            value={form.year}
            onChange={(e) => setForm({ ...form, year: e.target.value })}
          />
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs text-neutral-400">
              Sub-estilos (máx 3)
            </label>
            <SubstyleMultiSelect
              style={form.style}
              value={form.substyles}
              onChange={(substyles) => setForm({ ...form, substyles })}
            />
          </div>
        </div>

        {err && <p className="mt-3 text-sm text-red-300">{err}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={saving} onClick={save}>
            {saving ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </div>
    </div>
  );
}
