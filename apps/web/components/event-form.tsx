'use client';

import {
  CHILE_REGIONS,
  DANCE_STYLES,
  type DanceStyle,
  type ExtractionConfidence,
  type FlyerExtraction,
} from '@baile-latino/types';
import { Button, Input, Select } from '@/components/ui';
import { clsx } from '@/components/clsx';
import type { EventFormValues } from '@/lib/events';

type Hints = FlyerExtraction['confidence'];

/** Campos que se marcan para revisar según la confianza de la lectura del flyer. */
const HINT_FIELD: Partial<Record<keyof EventFormValues, keyof Hints>> = {
  startsAt: 'date',
  endsAt: 'date',
  venueName: 'venue',
  address: 'venue',
  city: 'venue',
  region: 'region',
  priceInfo: 'prices',
};

function hintClass(level: ExtractionConfidence | undefined): string {
  if (level === 'low') return 'border-amber-500/70 bg-amber-500/5';
  if (level === 'medium') return 'border-amber-500/30';
  return '';
}

function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: ExtractionConfidence;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={clsx('flex flex-col gap-1', className)}>
      <span className="flex items-center gap-2 text-xs font-medium text-neutral-400">
        {label}
        {hint && hint !== 'high' && (
          <span
            title={
              hint === 'low'
                ? 'No estaba claro en el flyer: revísalo.'
                : 'Deducido del flyer: confirma que esté bien.'
            }
            className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300"
          >
            {hint === 'low' ? 'revisar' : 'confirmar'}
          </span>
        )}
      </span>
      {children}
    </label>
  );
}

export function EventForm({
  values,
  onChange,
  onSubmit,
  submitLabel,
  busy,
  error,
  hints,
  notes,
  showStatus = false,
  onCancel,
}: {
  values: EventFormValues;
  onChange: (v: EventFormValues) => void;
  onSubmit: () => void;
  submitLabel: string;
  busy?: boolean;
  error?: string | null;
  /** Confianza por campo de la lectura automática (marca qué revisar). */
  hints?: Hints;
  /** Observaciones del lector de flyers. */
  notes?: string | null;
  showStatus?: boolean;
  onCancel?: () => void;
}) {
  const set = <K extends keyof EventFormValues>(k: K, v: EventFormValues[K]) =>
    onChange({ ...values, [k]: v });
  const h = (k: keyof EventFormValues) => {
    const key = HINT_FIELD[k];
    return key ? hints?.[key] : undefined;
  };
  const toggleStyle = (s: DanceStyle) =>
    set(
      'styles',
      values.styles.includes(s)
        ? values.styles.filter((x) => x !== s)
        : [...values.styles, s],
    );

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      {notes && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-200">
          <span className="font-semibold">Ojo:</span> {notes}
        </div>
      )}

      <Field label="Nombre del evento">
        <Input
          value={values.title}
          onChange={(e) => set('title', e.target.value)}
          placeholder="Social de bachata en Reñaca"
          required
          maxLength={140}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Empieza" hint={h('startsAt')}>
          <Input
            type="datetime-local"
            value={values.startsAt}
            onChange={(e) => set('startsAt', e.target.value)}
            required
            className={hintClass(h('startsAt'))}
          />
        </Field>
        <Field label="Termina (opcional)">
          <Input
            type="datetime-local"
            value={values.endsAt}
            onChange={(e) => set('endsAt', e.target.value)}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Región" hint={h('region')}>
          <Select
            value={values.region}
            onChange={(e) =>
              set('region', e.target.value as EventFormValues['region'])
            }
            required
            className={clsx('w-full', hintClass(h('region')))}
          >
            <option value="">Elige una región…</option>
            {CHILE_REGIONS.map((r) => (
              <option key={r.code} value={r.code}>
                {r.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Ciudad o comuna" hint={h('city')}>
          <Input
            value={values.city}
            onChange={(e) => set('city', e.target.value)}
            placeholder="Viña del Mar"
            className={hintClass(h('city'))}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Lugar" hint={h('venueName')}>
          <Input
            value={values.venueName}
            onChange={(e) => set('venueName', e.target.value)}
            placeholder="Bar Tropical"
            className={hintClass(h('venueName'))}
          />
        </Field>
        <Field label="Dirección">
          <Input
            value={values.address}
            onChange={(e) => set('address', e.target.value)}
            placeholder="Av. San Martín 123"
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
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
        <Field label="% de bachata (opcional)">
          <Input
            type="number"
            min={0}
            max={100}
            value={values.bachataPct}
            onChange={(e) => set('bachataPct', e.target.value)}
            placeholder="70"
          />
        </Field>
      </div>

      <Field label="Precios y preventas" hint={h('priceInfo')}>
        <Input
          value={values.priceInfo}
          onChange={(e) => set('priceInfo', e.target.value)}
          placeholder="Preventa $5.000 · Puerta $7.000"
          className={hintClass(h('priceInfo'))}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Link de entradas">
          <Input
            type="url"
            value={values.ticketUrl}
            onChange={(e) => set('ticketUrl', e.target.value)}
            placeholder="https://…"
          />
        </Field>
        <Field label="Link del post de Instagram">
          <Input
            type="url"
            value={values.instagramUrl}
            onChange={(e) => set('instagramUrl', e.target.value)}
            placeholder="https://www.instagram.com/p/…"
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Organiza">
          <Input
            value={values.organizerName}
            onChange={(e) => set('organizerName', e.target.value)}
            placeholder="Bachata Lovers"
          />
        </Field>
        <Field label="Instagram del organizador">
          <div className="flex items-center rounded-lg border border-neutral-700 bg-neutral-900 focus-within:border-brand">
            <span className="pl-3 text-sm text-neutral-500">@</span>
            <input
              value={values.organizerInstagram}
              onChange={(e) =>
                set('organizerInstagram', e.target.value.replace(/^@/, ''))
              }
              placeholder="bachatalovers.cl"
              className="w-full bg-transparent px-2 py-2 text-sm placeholder:text-neutral-500 focus:outline-none"
            />
          </div>
        </Field>
      </div>

      <Field label="Descripción (opcional)">
        <textarea
          value={values.description}
          onChange={(e) => set('description', e.target.value)}
          rows={3}
          maxLength={4000}
          placeholder="DJs, artistas invitados, clase previa, dress code…"
          className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm placeholder:text-neutral-500 focus:border-brand focus:outline-none"
        />
      </Field>

      {showStatus && (
        <Field label="Estado">
          <Select
            value={values.status}
            onChange={(e) =>
              set('status', e.target.value as EventFormValues['status'])
            }
            className="w-full sm:w-64"
          >
            <option value="PUBLISHED">Publicado</option>
            <option value="CANCELLED">Cancelado</option>
          </Select>
        </Field>
      )}

      {error && <div className="text-sm text-red-300">{error}</div>}

      <div className="flex flex-wrap items-center gap-3">
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
