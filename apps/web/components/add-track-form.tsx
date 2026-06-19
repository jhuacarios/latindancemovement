'use client';

import { useState } from 'react';
import {
  DANCE_STYLES,
  type DanceStyle,
  type ExtractedTrackMetadata,
  type YoutubeDetails,
} from '@baile-latino/types';
import { api, ApiError } from '@/lib/api';
import { Button, Card, Input, Select } from './ui';
import { SubstyleMultiSelect } from './substyle-select';

export interface NewTrackBody {
  title: string;
  artist: string;
  style: DanceStyle;
  substyles?: string[];
  bpm?: number;
  year?: number;
  coverUrl?: string;
  link: string;
  ytMetadata?: string;
}

/**
 * Formulario para agregar una canción pegando un link (con autocompletar
 * desde YouTube). El padre decide qué hacer con el body (catálogo o personal).
 */
export function AddTrackForm({
  title,
  submitLabel,
  onCreate,
  onDone,
}: {
  title: string;
  submitLabel: string;
  onCreate: (body: NewTrackBody) => Promise<unknown>;
  onDone: () => void;
}) {
  const [form, setForm] = useState({
    title: '',
    artist: '',
    style: 'BACHATA' as DanceStyle,
    substyles: [] as string[],
    bpm: '',
    year: '',
    coverUrl: '',
    link: '',
  });
  const [ytDetails, setYtDetails] = useState<YoutubeDetails | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);

  async function autofill() {
    if (!form.link.trim()) {
      setErr('Pega primero un link de YouTube.');
      return;
    }
    setErr(null);
    setInfo(null);
    setFetching(true);
    try {
      const m = await api<ExtractedTrackMetadata>(
        `/music/tracks/metadata?link=${encodeURIComponent(form.link)}`,
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
      setInfo(`✓ Autocompletado (${parts.join(' · ')}). Revisa y guarda.`);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'No se pudo leer el link');
    } finally {
      setFetching(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setSaving(true);
    try {
      await onCreate({
        title: form.title,
        artist: form.artist,
        style: form.style,
        substyles: form.substyles,
        bpm: form.bpm ? Number(form.bpm) : undefined,
        year: form.year ? Number(form.year) : undefined,
        coverUrl: form.coverUrl || undefined,
        link: form.link,
        ytMetadata: ytDetails ? JSON.stringify(ytDetails) : undefined,
      });
      onDone();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <h2 className="mb-3 font-semibold">{title}</h2>
      <form className="grid grid-cols-1 gap-3 md:grid-cols-2" onSubmit={submit}>
        <div className="md:col-span-2">
          <label className="mb-1 block text-xs text-neutral-400">
            Pega un link de YouTube y autocompleta los datos
          </label>
          <div className="flex gap-2">
            <Input
              placeholder="https://youtu.be/… *"
              required
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
          placeholder="Título *"
          required
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
        <Input
          placeholder="Artista *"
          required
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
          placeholder="BPM (opcional)"
          value={form.bpm}
          onChange={(e) => setForm({ ...form, bpm: e.target.value })}
        />
        <Input
          type="number"
          placeholder="Año (opcional)"
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

        {err && (
          <p className="md:col-span-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {err}
          </p>
        )}

        <div className="md:col-span-2">
          <Button type="submit" disabled={saving}>
            {saving ? 'Guardando…' : submitLabel}
          </Button>
        </div>
      </form>
    </Card>
  );
}
