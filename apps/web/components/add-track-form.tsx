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
import { MONTHS, maxMonthFor } from '@/lib/months';

export interface NewTrackBody {
  title: string;
  artist: string;
  style: DanceStyle;
  substyles?: string[];
  year?: number;
  /** "YYYY-MM-DD"|"YYYY-MM"|"YYYY" — solo si el usuario editó la fecha. */
  releaseDate?: string;
  coverUrl?: string;
  link: string;
  ytMetadata?: string;
}

/** Respuesta de /music/tracks/spotify-metadata (autocompletar desde Spotify). */
interface SpotifyMetaResp {
  title: string;
  artist: string | null;
  durationSec: number | null;
  year: number | null;
  coverUrl: string | null;
  detectedStyle: DanceStyle | null;
}

/**
 * Formulario para agregar una canción pegando un link (con autocompletar
 * desde YouTube). El padre decide qué hacer con el body (catálogo o personal).
 */
export function AddTrackForm({
  title,
  submitLabel,
  source = 'YOUTUBE',
  onCreate,
  onDone,
}: {
  title: string;
  submitLabel: string;
  /** Fuente del formulario: solo acepta links de esa plataforma. */
  source?: 'YOUTUBE' | 'SPOTIFY';
  onCreate: (body: NewTrackBody) => Promise<unknown>;
  onDone: () => void;
}) {
  const isSpotify = source === 'SPOTIFY';
  const platformName = isSpotify ? 'Spotify' : 'YouTube';
  const matchesSource = (l: string) =>
    isSpotify
      ? /open\.spotify\.com|spotify:track/.test(l)
      : /youtu\.?be|youtube\.com/.test(l);
  const [form, setForm] = useState({
    title: '',
    artist: '',
    style: '' as DanceStyle | '',
    substyles: [] as string[],
    year: '',
    month: '',
    coverUrl: '',
    link: '',
  });
  /** Mes+año original de subida (para no pisar el día real si no se edita). */
  const [origDate, setOrigDate] = useState<{ m: string; y: string }>({
    m: '',
    y: '',
  });
  const [ytDetails, setYtDetails] = useState<YoutubeDetails | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);

  async function autofill() {
    const link = form.link.trim();
    if (!link) {
      setErr(`Pega primero un link de ${platformName}.`);
      return;
    }
    if (!matchesSource(link)) {
      setErr(`Este formulario es de ${platformName}: pega un link de ${platformName}.`);
      return;
    }
    setErr(null);
    setInfo(null);
    setFetching(true);
    try {
      if (isSpotify) {
        // Metadata vía la Web API de Spotify (sin ytMetadata).
        const m = await api<SpotifyMetaResp>(
          `/music/tracks/spotify-metadata?link=${encodeURIComponent(link)}`,
        );
        setForm((f) => ({
          ...f,
          title: m.title || f.title,
          artist: m.artist ?? f.artist,
          style: m.detectedStyle ?? f.style,
          year: m.year ? String(m.year) : f.year,
          month: '',
          coverUrl: m.coverUrl ?? f.coverUrl,
        }));
        setOrigDate({ m: '', y: m.year ? String(m.year) : '' });
        setYtDetails(null);
        const parts: string[] = ['Spotify'];
        if (m.detectedStyle) parts.push(`estilo: ${m.detectedStyle}`);
        if (m.durationSec) parts.push(`${Math.round(m.durationSec / 60)} min`);
        setInfo(`✓ Autocompletado (${parts.join(' · ')}). Revisa y guarda.`);
        return;
      }
      const m = await api<ExtractedTrackMetadata>(
        `/music/tracks/metadata?link=${encodeURIComponent(link)}`,
      );
      // Mes+año de la FECHA DE SUBIDA de YouTube (details.publishedAt).
      const pub = m.details?.publishedAt ?? '';
      const ym = /^(\d{4})-(\d{2})/.exec(pub);
      setForm((f) => ({
        ...f,
        title: m.title || f.title,
        artist: m.artist ?? f.artist,
        style: m.detectedStyle ?? f.style,
        year: ym ? ym[1] : m.year ? String(m.year) : f.year,
        month: ym ? ym[2] : '',
        coverUrl: m.coverUrl ?? f.coverUrl,
      }));
      setOrigDate({
        m: ym ? ym[2] : '',
        y: ym ? ym[1] : m.year ? String(m.year) : '',
      });
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
    if (!matchesSource(form.link.trim())) {
      setErr(`Pega un link de ${platformName}.`);
      return;
    }
    if (!form.style) {
      setErr('Elige un estilo.');
      return;
    }
    setSaving(true);
    try {
      // Fecha editada → "YYYY-MM-01". Solo se envía si el usuario CAMBIÓ el
      // mes/año respecto a la subida; si no, el backend usa la fecha de subida
      // completa (con su día real, más preciso para rep/día).
      const changed =
        form.month !== origDate.m || form.year !== origDate.y;
      const releaseDate =
        changed && form.month && /^\d{4}$/.test(form.year)
          ? `${form.year}-${form.month}-01`
          : undefined;
      await onCreate({
        title: form.title,
        artist: form.artist,
        style: form.style,
        substyles: form.substyles,
        year: form.year ? Number(form.year) : undefined,
        releaseDate,
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
            Pega un link de {platformName} y autocompleta los datos
          </label>
          <div className="flex gap-2">
            <Input
              placeholder={
                isSpotify
                  ? 'https://open.spotify.com/track/… *'
                  : 'https://youtu.be/… *'
              }
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
            setForm({
              ...form,
              style: e.target.value as DanceStyle | '',
              substyles: [],
            })
          }
        >
          <option value="">Selecciona un estilo…</option>
          {DANCE_STYLES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <div className="flex items-center gap-1">
          <Select
            className="shrink-0"
            value={form.month}
            onChange={(e) => setForm({ ...form, month: e.target.value })}
            aria-label="Mes"
          >
            <option value="">— mes</option>
            {MONTHS.slice(0, maxMonthFor(form.year)).map((m, i) => (
              <option key={m} value={String(i + 1).padStart(2, '0')}>
                {m}
              </option>
            ))}
          </Select>
          <Input
            type="text"
            inputMode="numeric"
            placeholder="Año (opcional)"
            value={form.year}
            onChange={(e) => {
              const y = e.target.value.replace(/[^0-9]/g, '').slice(0, 4);
              setForm((f) => ({
                ...f,
                year: y,
                // Si el mes ya no es válido para el nuevo año, se limpia.
                month:
                  f.month && Number(f.month) > maxMonthFor(y) ? '' : f.month,
              }));
            }}
          />
        </div>
        <div className="md:col-span-2">
          <label className="mb-1 block text-xs text-neutral-400">
            Sub-estilos (máx 4)
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
