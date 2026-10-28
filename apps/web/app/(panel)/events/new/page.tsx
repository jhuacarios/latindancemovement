'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import type { FlyerExtraction } from '@baile-latino/types';
import { ApiError } from '@/lib/api';
import {
  EMPTY_EVENT_FORM,
  createEvent,
  extractFlyer,
  formFromExtraction,
  validateForm,
  type EventFormValues,
} from '@/lib/events';
import { Button, Card, Spinner } from '@/components/ui';
import { clsx } from '@/components/clsx';
import { EventForm } from '@/components/event-form';

const ACCEPT = 'image/jpeg,image/png,image/webp';
const MAX_BYTES = 5 * 1024 * 1024;

export default function NewEventPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [step, setStep] = useState<'upload' | 'form'>('upload');
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<FlyerExtraction | null>(null);
  const [values, setValues] = useState<EventFormValues>(EMPTY_EVENT_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const pick = (f: File | undefined | null) => {
    setReadError(null);
    if (!f) return;
    if (!ACCEPT.split(',').includes(f.type)) {
      setReadError('Usa una imagen JPG, PNG o WEBP.');
      return;
    }
    if (f.size > MAX_BYTES) {
      setReadError('El flyer no puede superar 5 MB.');
      return;
    }
    setFile(f);
  };

  const read = async () => {
    if (!file) return;
    setReading(true);
    setReadError(null);
    try {
      const x = await extractFlyer(file, text);
      setExtraction(x);
      setValues(formFromExtraction(x));
      setStep('form');
    } catch (e) {
      setReadError(
        e instanceof ApiError ? e.message : 'No se pudo leer el flyer.',
      );
    } finally {
      setReading(false);
    }
  };

  const manual = () => {
    setExtraction(null);
    setValues(EMPTY_EVENT_FORM);
    setStep('form');
  };

  const save = async () => {
    const err = validateForm(values);
    if (err) {
      setSaveError(err);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const ev = await createEvent(values, file);
      await qc.invalidateQueries({ queryKey: ['events'] });
      router.push(`/events/${ev.id}`);
    } catch (e) {
      setSaveError(e instanceof ApiError ? e.message : 'No se pudo publicar.');
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <Link href="/events" className="text-sm text-neutral-400 hover:text-neutral-200">
          ← Eventos
        </Link>
        <h1 className="mt-1 text-2xl font-bold">Publicar evento</h1>
        <p className="text-sm text-neutral-400">
          Sube el flyer y, si quieres, pega el texto del post. Leemos los datos
          y tú solo confirmas.
        </p>
      </div>

      {step === 'upload' && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Card className="space-y-3">
            <div className="text-sm font-semibold">1. Flyer</div>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                pick(e.dataTransfer.files?.[0]);
              }}
              onClick={() => fileInput.current?.click()}
              className={clsx(
                'flex min-h-56 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-4 text-center transition',
                dragOver
                  ? 'border-brand bg-brand/5'
                  : 'border-neutral-700 hover:border-neutral-500',
              )}
            >
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={preview}
                  alt="Flyer"
                  className="max-h-80 rounded-lg object-contain"
                />
              ) : (
                <>
                  <div className="text-4xl">🖼️</div>
                  <div className="text-sm text-neutral-300">
                    Arrastra el flyer aquí o toca para elegirlo
                  </div>
                  <div className="text-xs text-neutral-500">JPG, PNG o WEBP · máx. 5 MB</div>
                </>
              )}
              <input
                ref={fileInput}
                type="file"
                accept={ACCEPT}
                className="hidden"
                onChange={(e) => pick(e.target.files?.[0])}
              />
            </div>
            {file && (
              <div className="flex items-center justify-between text-xs text-neutral-500">
                <span className="truncate">{file.name}</span>
                <button
                  type="button"
                  className="text-neutral-400 hover:text-neutral-200"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFile(null);
                  }}
                >
                  Quitar
                </button>
              </div>
            )}
          </Card>

          <Card className="flex flex-col gap-3">
            <div className="text-sm font-semibold">2. Texto del post (opcional)</div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={10}
              placeholder={
                'Pega aquí el texto de tu publicación de Instagram: fecha, lugar, precios, preventas, link de entradas…'
              }
              className="w-full flex-1 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm placeholder:text-neutral-500 focus:border-brand focus:outline-none"
            />
            {readError && <div className="text-sm text-red-300">{readError}</div>}
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" onClick={read} disabled={!file || reading}>
                {reading ? 'Leyendo el flyer…' : '✨ Leer flyer y continuar'}
              </Button>
              <Button type="button" variant="ghost" onClick={manual} disabled={reading}>
                Llenar a mano
              </Button>
            </div>
            {reading && <Spinner label="Extrayendo fecha, lugar y precios…" />}
            <p className="text-xs text-neutral-500">
              Nada se publica hasta que revises y confirmes el formulario.
            </p>
          </Card>
        </div>
      )}

      {step === 'form' && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Card>
            <EventForm
              values={values}
              onChange={setValues}
              onSubmit={save}
              submitLabel="Publicar evento"
              busy={saving}
              error={saveError}
              hints={extraction?.confidence}
              notes={extraction?.notes}
              onCancel={() => setStep('upload')}
            />
          </Card>
          <div className="space-y-3">
            <Card className="space-y-2">
              <div className="text-sm font-semibold">Flyer</div>
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="Flyer" className="w-full rounded-lg" />
              ) : (
                <div className="text-sm text-neutral-500">Sin flyer.</div>
              )}
              <button
                type="button"
                onClick={() => setStep('upload')}
                className="text-xs text-neutral-400 hover:text-neutral-200"
              >
                {preview ? 'Cambiar flyer o volver a leer' : 'Agregar flyer'}
              </button>
            </Card>
            {extraction && (
              <Card className="text-xs text-neutral-500">
                Los campos marcados con{' '}
                <span className="rounded bg-amber-500/15 px-1 py-0.5 font-semibold text-amber-300">
                  revisar
                </span>{' '}
                o{' '}
                <span className="rounded bg-amber-500/15 px-1 py-0.5 font-semibold text-amber-300">
                  confirmar
                </span>{' '}
                no estaban claros en el flyer. El resto se leyó con confianza
                alta, pero igual dales una mirada.
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
