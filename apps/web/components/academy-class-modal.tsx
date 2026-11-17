'use client';

import { useState } from 'react';
import { CLASS_LEVELS, DANCE_STYLES, type AcademyClassDto, type ClassLevel, type DanceStyle } from '@baile-latino/types';
import { ApiError } from '@/lib/api';
import {
  EMPTY_CLASS,
  LEVEL_LABEL,
  WEEKDAYS,
  WEEK_ORDER,
  academiesApi,
  classFormFrom,
  type ClassFormValues,
} from '@/lib/academies';
import { Field, textareaClass } from './academy-form';
import { Button, Input, Select } from './ui';

/** Crear o editar una clase del horario. */
export function AcademyClassModal({
  academyId,
  editing,
  onClose,
  onSaved,
}: {
  academyId: string;
  /** null = clase nueva. */
  editing: AcademyClassDto | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [v, setV] = useState<ClassFormValues>(editing ? classFormFrom(editing) : EMPTY_CLASS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof ClassFormValues>(k: K, val: ClassFormValues[K]) => setV({ ...v, [k]: val });

  const save = async () => {
    if (v.title.trim().length < 2) return setError('Ponle un nombre a la clase.');
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v.startTime)) return setError('Indica la hora de inicio.');
    setBusy(true);
    setError(null);
    try {
      if (editing) await academiesApi.updateClass(academyId, editing.id, v);
      else await academiesApi.createClass(academyId, v);
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo guardar la clase.');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg space-y-4 rounded-xl border border-neutral-800 bg-neutral-900 p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">{editing ? 'Editar clase' : 'Nueva clase'}</h2>

        <Field label="Nombre">
          <Input value={v.title} onChange={(e) => set('title', e.target.value)} placeholder="Bachata sensual intermedio" />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Día">
            <Select value={v.weekday} onChange={(e) => set('weekday', Number(e.target.value))} className="w-full">
              {WEEK_ORDER.map((d) => (
                <option key={d} value={d}>
                  {WEEKDAYS[d]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Hora">
            <Input type="time" value={v.startTime} onChange={(e) => set('startTime', e.target.value)} />
          </Field>
          <Field label="Duración (min)">
            <Input
              type="number"
              min={15}
              max={600}
              step={15}
              value={v.durationMin}
              onChange={(e) => set('durationMin', e.target.value)}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Estilo">
            <Select value={v.style} onChange={(e) => set('style', e.target.value as DanceStyle | '')} className="w-full">
              <option value="">—</option>
              {DANCE_STYLES.map((s) => (
                <option key={s} value={s}>
                  {s === 'BACHATA' ? 'Bachata' : 'Salsa'}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Nivel">
            <Select value={v.level} onChange={(e) => set('level', e.target.value as ClassLevel)} className="w-full">
              {CLASS_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {LEVEL_LABEL[l]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Profesor(es)">
            <Input value={v.teacherName} onChange={(e) => set('teacherName', e.target.value)} placeholder="Ana y Pedro" />
          </Field>
          <Field label="Lugar (si no es la academia)">
            <Input value={v.place} onChange={(e) => set('place', e.target.value)} placeholder="Sala 2" />
          </Field>
        </div>

        <Field label="Precio">
          <Input value={v.priceInfo} onChange={(e) => set('priceInfo', e.target.value)} placeholder="$8.000 la clase · $28.000 el mes" />
        </Field>

        <Field label="Descripción (opcional)">
          <textarea
            value={v.description}
            onChange={(e) => set('description', e.target.value)}
            rows={3}
            className={textareaClass}
            placeholder="Qué se ve en la clase, requisitos…"
          />
        </Field>

        <label className="flex items-center gap-2 text-sm text-neutral-300">
          <input type="checkbox" checked={v.active} onChange={(e) => set('active', e.target.checked)} className="accent-brand" />
          Se está dictando (si la desmarcas, no se muestra en el horario público)
        </label>

        {error && <p className="text-sm text-red-300">{error}</p>}
        <div className="flex flex-wrap gap-3">
          <Button onClick={save} disabled={busy}>
            {busy ? 'Guardando…' : 'Guardar'}
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  );
}
