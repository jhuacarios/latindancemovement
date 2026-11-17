'use client';

import { CHILE_REGIONS, DANCE_STYLES, type ChileRegion } from '@baile-latino/types';
import type { AcademyFormValues } from '@/lib/academies';
import { Button, Input, Select } from './ui';
import { clsx } from './clsx';

export function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={clsx('flex flex-col gap-1', className)}>
      <span className="text-xs font-medium text-neutral-400">{label}</span>
      {children}
    </label>
  );
}

export const textareaClass =
  'w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm placeholder:text-neutral-500 focus:border-brand focus:outline-none';

/** Perfil de la academia (crear y editar). */
export function AcademyForm({
  values,
  onChange,
  onSubmit,
  onCancel,
  submitLabel,
  busy,
  error,
  logoSlot,
}: {
  values: AcademyFormValues;
  onChange: (v: AcademyFormValues) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  submitLabel: string;
  busy?: boolean;
  error?: string | null;
  /** Selector de logo (al crear). */
  logoSlot?: React.ReactNode;
}) {
  const set = <K extends keyof AcademyFormValues>(k: K, v: AcademyFormValues[K]) => onChange({ ...values, [k]: v });
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <Field label="Nombre de la academia">
        <Input value={values.name} onChange={(e) => set('name', e.target.value)} placeholder="Academia Clave" />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Región">
          <Select
            value={values.region}
            onChange={(e) => set('region', e.target.value as ChileRegion | '')}
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
          <Input value={values.city} onChange={(e) => set('city', e.target.value)} placeholder="Viña del Mar" />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Dirección (opcional)">
          <Input value={values.address} onChange={(e) => set('address', e.target.value)} placeholder="Av. Libertad 123" />
        </Field>
        <Field label="Instagram (opcional)">
          <Input
            value={values.instagramHandle}
            onChange={(e) => set('instagramHandle', e.target.value)}
            placeholder="@academiaclave"
          />
        </Field>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-neutral-400">Estilos</span>
        <div className="flex gap-2">
          {DANCE_STYLES.map((s) => {
            const on = values.styles.includes(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => set('styles', on ? values.styles.filter((x) => x !== s) : [...values.styles, s])}
                className={clsx(
                  'rounded-full border px-3 py-1 text-xs font-semibold transition',
                  on ? 'border-brand bg-brand/15 text-brand' : 'border-neutral-700 text-neutral-300 hover:border-neutral-500',
                )}
              >
                {s === 'BACHATA' ? 'Bachata' : 'Salsa'}
              </button>
            );
          })}
        </div>
      </div>

      <Field label="Descripción (opcional)">
        <textarea
          value={values.description}
          onChange={(e) => set('description', e.target.value)}
          rows={4}
          placeholder="Quiénes son, qué enseñan, niveles, dónde están…"
          className={textareaClass}
        />
      </Field>

      {logoSlot}

      {error && <p className="text-sm text-red-300">{error}</p>}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? 'Guardando…' : submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
            Cancelar
          </Button>
        )}
      </div>
    </form>
  );
}
