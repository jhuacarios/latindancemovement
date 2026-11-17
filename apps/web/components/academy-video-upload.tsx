'use client';

import { useEffect, useRef, useState } from 'react';
import { DANCE_STYLES, type AcademyClassDto, type DanceStyle } from '@baile-latino/types';
import { ApiError } from '@/lib/api';
import {
  WEEKDAYS,
  academiesApi,
  fileHash,
  formatBytes,
  isDuplicateError,
  mediaMaxBytes,
  mediaMimeType,
  uploadAcademyVideo,
} from '@/lib/academies';
import { Field, textareaClass } from './academy-form';
import { Button, Card, Input, Select } from './ui';
import { clsx } from './clsx';

const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD local

/** checking = calculando la huella y comparando; duplicate = ya está, se salta. */
type ItemState = 'checking' | 'pending' | 'duplicate' | 'uploading' | 'done' | 'error';

interface Item {
  key: string;
  file: File;
  title: string;
  state: ItemState;
  /** Avance de la comparación o de la subida (0..1). */
  progress: number;
  error: string | null;
  /** SHA-256 del contenido (null si no se pudo calcular: se sube igual). */
  hash: string | null;
  /** Por qué se salta (duplicate). */
  note: string | null;
}

const HEVC_WARNING =
  'Los .MOV del iPhone suelen venir en HEVC, que algunos navegadores (Chrome en Windows) no reproducen. Si puedes, expórtalos como MP4 (H.264) o en el iPhone usa Ajustes → Cámara → Formatos → "Más compatible".';

/**
 * Subir una o varias fotos y videos. Van directo al storage privado, uno tras
 * otro; la miniatura, la duración y la huella (para saltar los que ya están) las
 * saca el navegador. La clase, el estilo, la fecha y la descripción valen para
 * todo el lote.
 */
export function AcademyVideoUpload({
  academyId,
  classes,
  freeBytes,
  onUploaded,
}: {
  academyId: string;
  classes: AcademyClassDto[];
  /** Espacio libre del cupo (null = desconocido). */
  freeBytes: number | null;
  onUploaded: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [classId, setClassId] = useState('');
  const [style, setStyle] = useState<DanceStyle | ''>('');
  const [recordedOn, setRecordedOn] = useState(today());
  const [description, setDescription] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  // La comparación corre en segundo plano: necesita ver la lista actual.
  const itemsRef = useRef<Item[]>(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const patch = (key: string, p: Partial<Item>) =>
    setItems((list) => list.map((it) => (it.key === key ? { ...it, ...p } : it)));
  const exists = (key: string) => itemsRef.current.some((x) => x.key === key);

  /**
   * Calcula la huella de cada archivo nuevo y salta los idénticos: los que ya están
   * en la galería y los repetidos dentro de la misma lista. Uno por uno, sin frenar
   * a los demás (si algo falla, el archivo queda para subir igual).
   */
  const check = async (fresh: Item[]) => {
    for (const it of fresh) {
      if (!exists(it.key)) continue; // lo quitaron mientras esperaba
      let hash: string | null = null;
      try {
        hash = await fileHash(it.file, (p) => patch(it.key, { progress: p }));
      } catch {
        /* sin huella: se sube igual */
      }
      if (!exists(it.key)) continue;
      if (hash) {
        const twin = itemsRef.current.find(
          (x) => x.key !== it.key && x.hash === hash && x.state !== 'duplicate' && x.state !== 'done',
        );
        if (twin) {
          patch(it.key, { state: 'duplicate', hash, progress: 0, note: `Repetido en esta lista ("${twin.title}").` });
          continue;
        }
        const found = await academiesApi.duplicates(academyId, [hash]).catch(() => []);
        if (found.length > 0) {
          const where = found[0].location === 'VAULT' ? 'en la bóveda' : 'en la galería';
          patch(it.key, { state: 'duplicate', hash, progress: 0, note: `Ya está ${where}: "${found[0].title}".` });
          continue;
        }
      }
      patch(it.key, { state: 'pending', hash, progress: 0 });
    }
  };

  const add = (files: FileList | File[] | null) => {
    if (!files) return;
    setError(null);
    const rejected: string[] = [];
    const next: Item[] = [];
    for (const f of Array.from(files)) {
      const mime = mediaMimeType(f);
      if (!mime) rejected.push(`${f.name}: formato no permitido`);
      else if (f.size > mediaMaxBytes(mime)) rejected.push(`${f.name}: supera ${formatBytes(mediaMaxBytes(mime))}`);
      else
        next.push({
          key: `${f.name}-${f.size}-${f.lastModified}-${Math.random()}`,
          file: f,
          title: f.name.slice(0, 160), // con extensión
          state: 'checking',
          progress: 0,
          error: null,
          hash: null,
          note: null,
        });
    }
    // Lo que ya terminó o se saltó se saca de la lista al agregar otro lote.
    const kept = itemsRef.current.filter((it) => it.state !== 'done' && it.state !== 'duplicate');
    itemsRef.current = [...kept, ...next];
    setItems(itemsRef.current);
    if (rejected.length) setError(rejected.join(' · '));
    if (input.current) input.current.value = '';
    void check(next);
  };

  const pickClass = (id: string) => {
    setClassId(id);
    const c = classes.find((x) => x.id === id);
    if (c?.style && !style) setStyle(c.style);
  };

  const pending = items.filter((it) => it.state === 'pending' || it.state === 'error');
  const pendingBytes = pending.reduce((s, it) => s + it.file.size, 0);
  const overQuota = freeBytes !== null && pendingBytes > freeBytes;
  const hasMov = items.some((it) => mediaMimeType(it.file) === 'video/quicktime' && it.state !== 'done');

  const submit = async () => {
    if (pending.some((it) => it.title.trim().length < 2)) return setError('Cada archivo necesita un título.');
    setError(null);
    setRunning(true);
    let uploaded = 0;
    for (const it of pending) {
      patch(it.key, { state: 'uploading', progress: 0, error: null });
      try {
        await uploadAcademyVideo(
          academyId,
          {
            file: it.file,
            title: it.title.trim(),
            classId: classId || null,
            style: style || null,
            recordedOn: recordedOn || null,
            description: description.trim() || null,
            contentHash: it.hash ?? undefined,
          },
          (p) => patch(it.key, { progress: p }),
        );
        patch(it.key, { state: 'done', progress: 1 });
        uploaded++;
      } catch (e) {
        // Ya estaba (p. ej. lo subió otro profesor mientras tanto): se salta y se sigue.
        if (isDuplicateError(e)) {
          patch(it.key, { state: 'duplicate', progress: 0, note: (e as Error).message });
          continue;
        }
        patch(it.key, {
          state: 'error',
          error: e instanceof ApiError ? e.message : 'No se pudo subir.',
        });
        // Sin espacio, los que siguen tampoco caben.
        if (e instanceof ApiError && e.status === 409) break;
      }
    }
    setRunning(false);
    if (uploaded > 0) onUploaded();
  };

  const doneCount = items.filter((it) => it.state === 'done').length;
  const dupCount = items.filter((it) => it.state === 'duplicate').length;
  const checking = items.some((it) => it.state === 'checking');

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="font-semibold">Subir fotos y videos</h2>
        <p className="text-sm text-neutral-400">
          Puedes elegir varios a la vez. Videos MP4, MOV o WEBM hasta 3 GB; fotos JPG, PNG o WEBP hasta 25 MB. Los ven
          todos los usuarios con cuenta en Nectason: sube solo material donde las personas que aparecen estén de acuerdo.
        </p>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (!running) add(e.dataTransfer.files);
        }}
        onClick={() => !running && input.current?.click()}
        className={clsx(
          'flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed p-5 text-center text-sm transition',
          dragOver ? 'border-brand bg-brand/5' : 'border-neutral-700 hover:border-neutral-500',
          running && 'cursor-not-allowed opacity-60',
        )}
      >
        <span className="text-2xl">🎬</span>
        <span className="text-neutral-300">Arrastra fotos o videos aquí o toca para elegirlos</span>
        <input
          ref={input}
          type="file"
          multiple
          accept=".mp4,.m4v,.mov,.webm,.jpg,.jpeg,.png,.webp,video/*,image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => add(e.target.files)}
        />
      </div>
      {hasMov && <p className="text-xs text-amber-300">{HEVC_WARNING}</p>}

      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((it) => (
            <li key={it.key} className="space-y-1 rounded-lg border border-neutral-800 p-2">
              <div className="flex items-center gap-2">
                <span className="w-5 shrink-0 text-center text-sm">
                  {it.state === 'done'
                    ? '✅'
                    : it.state === 'duplicate'
                      ? '⏭️'
                      : it.state === 'checking'
                        ? '🔎'
                        : it.state === 'error'
                      ? '⚠️'
                      : it.state === 'uploading'
                        ? '⏫'
                        : it.file.type.startsWith('image/')
                          ? '🖼️'
                          : '🎞️'}
                </span>
                <Input
                  value={it.title}
                  onChange={(e) => patch(it.key, { title: e.target.value })}
                  disabled={running || it.state === 'done' || it.state === 'duplicate'}
                  className="py-1"
                />
                <span className="shrink-0 text-xs text-neutral-500">{formatBytes(it.file.size)}</span>
                {!running && it.state !== 'done' && (
                  <button
                    type="button"
                    onClick={() => setItems((list) => list.filter((x) => x.key !== it.key))}
                    className="shrink-0 text-xs text-neutral-500 hover:text-red-300"
                    title="Quitar de la lista"
                  >
                    ✕
                  </button>
                )}
              </div>
              {(it.state === 'uploading' || it.state === 'checking') && (
                <div className="h-1.5 overflow-hidden rounded-full bg-neutral-800">
                  <div
                    className={clsx('h-full transition-[width]', it.state === 'checking' ? 'bg-neutral-500' : 'bg-clave')}
                    style={{ width: `${Math.round(it.progress * 100)}%` }}
                  />
                </div>
              )}
              {it.state === 'checking' && <p className="text-xs text-neutral-500">Comparando con la galería…</p>}
              {it.note && <p className="text-xs text-amber-300/90">{it.note} No se va a subir.</p>}
              {it.error && <p className="text-xs text-red-300">{it.error}</p>}
            </li>
          ))}
        </ul>
      )}

      {pending.length > 0 && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Clase">
              <Select value={classId} onChange={(e) => pickClass(e.target.value)} disabled={running} className="w-full">
                <option value="">Contenido general</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title} ({WEEKDAYS[c.weekday].slice(0, 3)} {c.startTime})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Estilo">
              <Select value={style} onChange={(e) => setStyle(e.target.value as DanceStyle | '')} disabled={running} className="w-full">
                <option value="">—</option>
                {DANCE_STYLES.map((s) => (
                  <option key={s} value={s}>
                    {s === 'BACHATA' ? 'Bachata' : 'Salsa'}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Fecha de la clase">
              <Input type="date" value={recordedOn} onChange={(e) => setRecordedOn(e.target.value)} disabled={running} />
            </Field>
          </div>
          <Field label="Descripción (opcional, para todos)">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              disabled={running}
              className={textareaClass}
              placeholder="Qué se vio: figura, combinación, técnica…"
            />
          </Field>
        </>
      )}

      {overQuota && (
        <p className="text-sm text-amber-300">
          Estos videos suman {formatBytes(pendingBytes)} y la academia tiene {formatBytes(freeBytes ?? 0)} libres: los que no
          quepan no se van a subir.
        </p>
      )}
      {error && <p className="text-sm text-red-300">{error}</p>}
      {running && <p className="text-xs text-neutral-400">Subiendo… no cierres esta pestaña hasta que terminen.</p>}

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={submit} disabled={pending.length === 0 || running || checking}>
          {running
            ? 'Subiendo…'
            : checking
              ? 'Comparando…'
              : pending.length > 1
                ? `Subir ${pending.length} archivos`
                : 'Subir'}
        </Button>
        {doneCount > 0 && !running && (
          <span className="text-xs text-neutral-400">
            {doneCount} {doneCount === 1 ? 'archivo subido' : 'archivos subidos'}
          </span>
        )}
        {dupCount > 0 && (
          <span className="text-xs text-amber-300/90">
            {dupCount} {dupCount === 1 ? 'se salta porque ya está' : 'se saltan porque ya están'}
          </span>
        )}
      </div>
    </Card>
  );
}
