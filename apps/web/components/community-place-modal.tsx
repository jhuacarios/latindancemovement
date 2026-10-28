'use client';

import { useEffect, useRef, useState } from 'react';
import {
  CHILE_REGIONS,
  DANCE_STYLES,
  type CommunityPlaceDto,
  type DanceStyle,
} from '@baile-latino/types';
import { ApiError } from '@/lib/api';
import {
  EMPTY_PLACE_FORM,
  createPlace,
  formFromPlace,
  parseHandles,
  placePhotoUrl,
  replacePlacePhoto,
  updatePlace,
  validatePlaceForm,
  type CommunityPlaceFormValues,
  type PlaceKindCopy,
} from '@/lib/community-places';
import { Button, Input, Select } from '@/components/ui';
import { clsx } from '@/components/clsx';

const ACCEPT = 'image/jpeg,image/png,image/webp';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-neutral-400">{label}</span>
      {children}
    </label>
  );
}

/**
 * Modal para agregar o editar un lugar de la comunidad (social al aire libre,
 * salsoteca…). En "editar", la foto se sube aparte (PUT) después de guardar.
 */
export function CommunityPlaceModal({
  copy,
  existing,
  onClose,
  onSaved,
}: {
  copy: PlaceKindCopy;
  /** Lugar a editar; ausente = crear. */
  existing?: CommunityPlaceDto | null;
  onClose: () => void;
  onSaved: (s: CommunityPlaceDto) => void;
}) {
  const [values, setValues] = useState<CommunityPlaceFormValues>(
    existing ? formFromPlace(existing) : EMPTY_PLACE_FORM,
  );
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(
    existing ? placePhotoUrl(existing) : null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  useEffect(() => {
    if (!photo) return;
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const set = <K extends keyof CommunityPlaceFormValues>(
    k: K,
    v: CommunityPlaceFormValues[K],
  ) => setValues((prev) => ({ ...prev, [k]: v }));

  const toggleStyle = (s: DanceStyle) =>
    set(
      'styles',
      values.styles.includes(s)
        ? values.styles.filter((x) => x !== s)
        : [...values.styles, s],
    );

  const pick = (f: File | undefined | null) => {
    if (!f) return;
    if (!ACCEPT.split(',').includes(f.type)) {
      setError('Usa una imagen JPG, PNG o WEBP.');
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      setError('La foto no puede superar 5 MB.');
      return;
    }
    setError(null);
    setPhoto(f);
  };

  const save = async () => {
    const err = validatePlaceForm(values);
    if (err) {
      setError(err);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let saved: CommunityPlaceDto;
      if (existing) {
        saved = await updatePlace(existing.id, values);
        if (photo) saved = await replacePlacePhoto(existing.id, photo);
      } else {
        saved = await createPlace(copy.kind, values, photo);
      }
      onSaved(saved);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo guardar.');
      setBusy(false);
    }
  };

  const handles = parseHandles(values.instagramHandles);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={() => !busy && onClose()}
    >
      <div
        className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-xl border border-neutral-800 bg-neutral-900 p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">
            {existing ? '✏️ Editar' : `${copy.emoji} ${copy.addLabel}`}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg bg-neutral-800 px-2 py-1 text-sm hover:bg-neutral-700"
          >
            ✕
          </button>
        </div>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <Field label="Nombre">
            <Input
              autoFocus
              value={values.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder={copy.namePlaceholder}
              maxLength={140}
              required
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Región">
              <Select
                value={values.region}
                onChange={(e) =>
                  set('region', e.target.value as CommunityPlaceFormValues['region'])
                }
                required
                className="w-full"
              >
                <option value="">Elige una región…</option>
                {CHILE_REGIONS.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Ciudad o comuna">
              <Input
                value={values.city}
                onChange={(e) => set('city', e.target.value)}
                placeholder="Viña del Mar"
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {!copy.hideAddress && (
              <Field label="Dirección">
                <Input
                  value={values.address}
                  onChange={(e) => set('address', e.target.value)}
                  placeholder={copy.addressPlaceholder}
                />
              </Field>
            )}
            <Field label={copy.placeLabel}>
              <Input
                value={values.place}
                onChange={(e) => set('place', e.target.value)}
                placeholder={copy.placePlaceholder}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={copy.scheduleLabel}>
              <Input
                value={values.schedule}
                onChange={(e) => set('schedule', e.target.value)}
                placeholder={copy.schedulePlaceholder}
              />
            </Field>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-neutral-400">Estilos</span>
              <div className="flex gap-2">
                {DANCE_STYLES.map((s) => {
                  const on = values.styles.includes(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => toggleStyle(s)}
                      className={clsx(
                        'rounded-full border px-3 py-1.5 text-xs font-semibold transition',
                        on
                          ? s === 'BACHATA'
                            ? 'border-amber-400/60 bg-amber-500/15 text-amber-300'
                            : 'border-red-400/60 bg-red-500/15 text-red-300'
                          : 'border-neutral-700 text-neutral-400 hover:border-neutral-500',
                      )}
                    >
                      {s === 'BACHATA' ? 'Bachata' : 'Salsa'}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <Field label="Cuentas de Instagram que lo organizan o anuncian">
            <textarea
              value={values.instagramHandles}
              onChange={(e) => set('instagramHandles', e.target.value)}
              rows={2}
              placeholder={'@socialdeplaya.cl\n@bachatalovers.vina'}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm placeholder:text-neutral-500 focus:border-brand focus:outline-none"
            />
            {handles.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {handles.map((h) => (
                  <span
                    key={h}
                    className="rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300"
                  >
                    @{h}
                  </span>
                ))}
              </div>
            )}
          </Field>

          <Field label="Descripción (opcional)">
            <textarea
              value={values.description}
              onChange={(e) => set('description', e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder={copy.descriptionPlaceholder}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm placeholder:text-neutral-500 focus:border-brand focus:outline-none"
            />
          </Field>

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-3">
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="" className="h-16 w-16 rounded-lg object-cover" />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-neutral-800 text-2xl">
                  {copy.emoji}
                </div>
              )}
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  className="text-left text-xs text-brand hover:underline"
                >
                  {preview ? 'Cambiar foto' : 'Agregar foto (opcional)'}
                </button>
                <span className="text-[11px] text-neutral-500">JPG, PNG o WEBP · máx. 5 MB</span>
              </div>
              <input
                ref={fileInput}
                type="file"
                accept={ACCEPT}
                className="hidden"
                onChange={(e) => pick(e.target.files?.[0])}
              />
            </div>
            {existing && (
              <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm text-neutral-300">
                <input
                  type="checkbox"
                  checked={values.active}
                  onChange={(e) => set('active', e.target.checked)}
                  className="accent-brand"
                />
                Activo
              </label>
            )}
          </div>

          {error && <div className="text-sm text-red-300">{error}</div>}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Guardando…' : existing ? 'Guardar cambios' : copy.addLabel}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
