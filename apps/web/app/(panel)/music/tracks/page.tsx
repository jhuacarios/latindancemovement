'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DANCE_STYLES,
  DANCE_SUBSTYLES,
  TRACK_SOURCES,
  type DanceStyle,
  type DanceSubstyle,
  type ExtractedTrackMetadata,
  type Paginated,
  type Track,
} from '@baile-latino/types';
import { api, ApiError, downloadFile } from '@/lib/api';
import { Button, Card, Input, Select, Spinner, StyleBadge } from '@/components/ui';

const PAGE_SIZE = 20;

export default function TracksPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [style, setStyle] = useState('');
  const [source, setSource] = useState('');
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);

  const filters = { search, style, source, page };

  const { data, isLoading, error } = useQuery({
    queryKey: ['tracks', filters],
    queryFn: () => {
      const p = new URLSearchParams();
      if (search) p.set('search', search);
      if (style) p.set('style', style);
      if (source) p.set('source', source);
      p.set('page', String(page));
      p.set('pageSize', String(PAGE_SIZE));
      return api<Paginated<Track>>(`/music/tracks?${p.toString()}`);
    },
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  function exportExcel() {
    const p = new URLSearchParams();
    if (search) p.set('search', search);
    if (style) p.set('style', style);
    if (source) p.set('source', source);
    void downloadFile(`/music/tracks/export.xlsx?${p.toString()}`, 'canciones.xlsx');
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Canciones</h1>
          <p className="text-sm text-neutral-400">
            {data ? `${data.total} en el catálogo` : ' '}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={exportExcel}>
            ⬇ Exportar Excel
          </Button>
          <Button onClick={() => setShowForm((s) => !s)}>
            {showForm ? 'Cerrar' : '+ Nueva canción'}
          </Button>
        </div>
      </div>

      {showForm && (
        <NewTrackForm
          onCreated={() => {
            setShowForm(false);
            void qc.invalidateQueries({ queryKey: ['tracks'] });
            void qc.invalidateQueries({ queryKey: ['catalog-summary'] });
          }}
        />
      )}

      {/* filtros */}
      <Card className="flex flex-wrap items-end gap-3">
        <div className="grow">
          <label className="mb-1 block text-xs text-neutral-400">Buscar</label>
          <Input
            placeholder="Título o artista…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-neutral-400">Estilo</label>
          <Select
            value={style}
            onChange={(e) => {
              setStyle(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {DANCE_STYLES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-neutral-400">Fuente</label>
          <Select
            value={source}
            onChange={(e) => {
              setSource(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todas</option>
            {TRACK_SOURCES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      {/* tabla */}
      {isLoading && <Spinner />}
      {error && <p className="text-sm text-red-300">No se pudieron cargar las canciones.</p>}

      {data && (
        <Card className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-800 text-left text-neutral-400">
              <tr>
                <th className="px-4 py-3">Título</th>
                <th className="px-4 py-3">Artista</th>
                <th className="px-4 py-3">Estilo</th>
                <th className="px-4 py-3">BPM</th>
                <th className="px-4 py-3">Fuente</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((t) => (
                <tr key={t.id} className="border-b border-neutral-800/60 last:border-0">
                  <td className="px-4 py-3 font-medium">{t.title}</td>
                  <td className="px-4 py-3 text-neutral-300">{t.artist}</td>
                  <td className="px-4 py-3">
                    <StyleBadge style={t.substyle ?? t.style} />
                  </td>
                  <td className="px-4 py-3 text-neutral-400">{t.bpm ?? '—'}</td>
                  <td className="px-4 py-3 text-neutral-400">{t.source}</td>
                  <td className="px-4 py-3 text-right">
                    <a
                      href={t.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-brand hover:underline"
                    >
                      escuchar ↗
                    </a>
                  </td>
                </tr>
              ))}
              {data.data.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-neutral-500">
                    Sin resultados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      {data && data.total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm">
          <Button
            variant="ghost"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            ← Anterior
          </Button>
          <span className="text-neutral-400">
            Página {page} de {totalPages}
          </span>
          <Button
            variant="ghost"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Siguiente →
          </Button>
        </div>
      )}
    </div>
  );
}

function NewTrackForm({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState({
    title: '',
    artist: '',
    style: 'BACHATA' as DanceStyle,
    substyle: '' as '' | DanceSubstyle,
    bpm: '',
    year: '',
    coverUrl: '',
    link: '',
  });
  const [err, setErr] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

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
        substyle: m.detectedSubstyle ?? f.substyle,
        year: m.year ? String(m.year) : f.year,
        coverUrl: m.coverUrl ?? f.coverUrl,
      }));
      const parts: string[] = [];
      if (m.detectedStyle) parts.push(`estilo: ${m.detectedStyle}`);
      if (m.durationSec) parts.push(`${Math.round(m.durationSec / 60)} min`);
      parts.push(m.via === 'youtube-api' ? 'YouTube API' : 'oEmbed (básico)');
      setInfo(`✓ Autocompletado (${parts.join(' · ')}). Revisa y guarda.`);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'No se pudo leer el link');
    } finally {
      setFetching(false);
    }
  }

  const mutation = useMutation({
    mutationFn: () =>
      api<Track>('/music/tracks', {
        method: 'POST',
        body: {
          title: form.title,
          artist: form.artist,
          style: form.style,
          substyle: form.substyle || undefined,
          bpm: form.bpm ? Number(form.bpm) : undefined,
          year: form.year ? Number(form.year) : undefined,
          coverUrl: form.coverUrl || undefined,
          link: form.link,
        },
      }),
    onSuccess: onCreated,
    onError: (e) =>
      setErr(e instanceof ApiError ? e.message : 'No se pudo crear'),
  });

  const subForStyle = DANCE_SUBSTYLES.filter((s) => s.startsWith(form.style));

  return (
    <Card>
      <h2 className="mb-3 font-semibold">Nueva canción</h2>
      <form
        className="grid grid-cols-1 gap-3 md:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          setErr(null);
          mutation.mutate();
        }}
      >
        <div className="md:col-span-2">
          <label className="mb-1 block text-xs text-neutral-400">
            Pega un link de YouTube y autocompleta los datos
          </label>
          <div className="flex gap-2">
            <Input
              placeholder="https://youtu.be/… o link de Spotify *"
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
            setForm({ ...form, style: e.target.value as DanceStyle, substyle: '' })
          }
        >
          {DANCE_STYLES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <Select
          value={form.substyle}
          onChange={(e) =>
            setForm({ ...form, substyle: e.target.value as DanceSubstyle | '' })
          }
        >
          <option value="">Sub-estilo (opcional)</option>
          {subForStyle.map((s) => (
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

        {err && (
          <p className="md:col-span-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {err}
          </p>
        )}

        <div className="md:col-span-2">
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Guardando…' : 'Guardar canción'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
