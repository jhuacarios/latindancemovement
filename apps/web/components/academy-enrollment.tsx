'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AcademyClassDto, AcademyDto, AcademyEnrollmentDto } from '@baile-latino/types';
import { ApiError } from '@/lib/api';
import { WEEKDAYS, academiesApi } from '@/lib/academies';
import { chatKeys } from '@/lib/chat';
import { Button, Card, Spinner } from '@/components/ui';
import { ConfirmDialog, type ConfirmOptions } from '@/components/confirm-dialog';
import { InstagramLink } from '@/components/instagram-link';

/** "3/12 inscritos" o "3 inscritos". */
export function enrolledLabel(c: Pick<AcademyClassDto, 'enrolledCount' | 'capacity'>): string {
  return c.capacity ? `${c.enrolledCount}/${c.capacity} inscritos` : `${c.enrolledCount} inscritos`;
}

const isFull = (c: AcademyClassDto) => c.capacity !== null && c.enrolledCount >= c.capacity;

/** Lo que ve un alumno en cada clase: pedir, esperar, inscrito (chat) o volver a pedir. */
export function EnrollBox({ a, c, onChanged }: { a: AcademyDto; c: AcademyClassDto; onChanged: () => void }) {
  const qc = useQueryClient();
  const [asking, setAsking] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setAsking(false);
      setMessage('');
      onChanged();
      void qc.invalidateQueries({ queryKey: chatKeys.conversations });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo completar.');
    } finally {
      setBusy(false);
    }
  };

  const full = isFull(c);
  return (
    <div className="space-y-1.5 pt-1.5">
      <div className="text-[11px] text-neutral-500">
        {enrolledLabel(c)}
        {full && ' · clase llena'}
      </div>

      {c.myEnrollment === 'ACCEPTED' ? (
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="rounded bg-brand/15 px-2 py-0.5 font-semibold text-brand">✓ Inscrito</span>
          {c.chatId && (
            <Link href={`/chat/${c.chatId}`} className="text-brand hover:underline">
              💬 Chat de la clase
            </Link>
          )}
          <button
            type="button"
            className="text-neutral-500 hover:text-red-300"
            onClick={() =>
              setConfirm({
                title: 'Dejar la clase',
                message: `Saldrás de "${c.title}", de su chat, y dejarás de ver sus videos.`,
                confirmLabel: 'Dejar la clase',
                danger: true,
                onConfirm: () => void run(() => academiesApi.unenroll(a.id, c.id)),
              })
            }
          >
            Dejar la clase
          </button>
        </div>
      ) : c.myEnrollment === 'PENDING' ? (
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="rounded bg-amber-500/15 px-2 py-0.5 font-semibold text-amber-300">
            ⏳ Solicitud enviada{full ? ' (en espera de cupo)' : ''}
          </span>
          <button
            type="button"
            className="text-neutral-500 hover:text-neutral-200"
            disabled={busy}
            onClick={() => void run(() => academiesApi.unenroll(a.id, c.id))}
          >
            Cancelar
          </button>
        </div>
      ) : asking ? (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => academiesApi.enroll(a.id, c.id, message));
          }}
        >
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Mensaje para el director (opcional): tu nivel, desde cuándo bailas…"
            className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs placeholder:text-neutral-500 focus:border-brand focus:outline-none"
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? 'Enviando…' : 'Enviar solicitud'}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setAsking(false)}>
              Cancelar
            </Button>
          </div>
          <p className="text-[11px] text-neutral-500">
            El director la recibe en la academia y por el chat. {full && 'La clase está llena: quedarás en espera.'}
          </p>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Button type="button" size="sm" onClick={() => setAsking(true)}>
            {c.myEnrollment === 'REJECTED' ? 'Volver a pedir inscripción' : 'Solicitar inscripción'}
          </Button>
          {c.myEnrollment === 'REJECTED' && <span className="text-neutral-500">Tu solicitud anterior no fue aceptada.</span>}
        </div>
      )}
      {error && <p className="text-xs text-red-300">{error}</p>}
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}

/** Lo que ve quien administra en cada clase: inscritos, pendientes y el chat. */
export function ClassEnrollmentInfo({ c, onRequests }: { c: AcademyClassDto; onRequests: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-neutral-500">
      <span>{enrolledLabel(c)}</span>
      {c.pendingCount > 0 && (
        <button type="button" onClick={onRequests} className="font-semibold text-amber-300 hover:underline">
          {c.pendingCount} {c.pendingCount === 1 ? 'solicitud' : 'solicitudes'}
        </button>
      )}
      {c.chatId && (
        <Link href={`/chat/${c.chatId}`} className="text-brand hover:underline">
          💬 Chat
        </Link>
      )}
    </div>
  );
}

const when = (e: Pick<AcademyEnrollmentDto, 'weekday' | 'startTime'>) => `${WEEKDAYS[e.weekday]} ${e.startTime}`;

/** Pestaña del director: solicitudes pendientes y alumnos inscritos por clase. */
export function RequestsTab({ a, onChanged }: { a: AcademyDto; onChanged: () => void }) {
  const qc = useQueryClient();
  const key = ['academy-enrollments', a.id];
  const { data, isLoading } = useQuery({ queryKey: key, queryFn: () => academiesApi.enrollments(a.id) });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null);

  const act = async (id: string, fn: () => Promise<AcademyEnrollmentDto[]>) => {
    setBusy(id);
    setError(null);
    try {
      qc.setQueryData(key, await fn());
      onChanged();
      void qc.invalidateQueries({ queryKey: chatKeys.conversations });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo completar.');
    } finally {
      setBusy(null);
    }
  };

  if (isLoading || !data) return <Spinner />;
  const pending = data.filter((e) => e.status === 'PENDING');
  const accepted = data.filter((e) => e.status === 'ACCEPTED');
  const byClass = a.classes
    .map((c) => ({ c, students: accepted.filter((e) => e.classId === c.id) }))
    .filter((x) => x.students.length > 0);

  return (
    <div className="space-y-4">
      {error && <Card className="text-sm text-red-300">{error}</Card>}
      <Card className="space-y-3">
        <h3 className="font-semibold">Solicitudes pendientes ({pending.length})</h3>
        {pending.length === 0 ? (
          <p className="text-sm text-neutral-500">No hay solicitudes por revisar.</p>
        ) : (
          <ul className="divide-y divide-neutral-800">
            {pending.map((e) => {
              const cls = a.classes.find((c) => c.id === e.classId);
              const full = cls ? isFull(cls) : false;
              return (
                <li key={e.id} className="flex flex-wrap items-start gap-3 py-3">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2 font-medium">
                      {e.userName}
                      {e.instagramHandle && <InstagramLink handle={e.instagramHandle} size="sm" />}
                    </div>
                    <div className="text-xs text-neutral-400">
                      {e.classTitle} · {when(e)}
                      {cls && ` · ${enrolledLabel(cls)}`}
                      {full && <span className="text-amber-300"> · clase llena</span>}
                    </div>
                    {e.message && <p className="whitespace-pre-line text-sm text-neutral-300">“{e.message}”</p>}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy === e.id || full}
                      title={full ? 'La clase está llena: sube el cupo o libera un lugar' : undefined}
                      onClick={() => void act(e.id, () => academiesApi.acceptEnrollment(a.id, e.id))}
                    >
                      Aceptar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busy === e.id}
                      onClick={() => void act(e.id, () => academiesApi.rejectEnrollment(a.id, e.id))}
                    >
                      Rechazar
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card className="space-y-3">
        <h3 className="font-semibold">Alumnos inscritos ({accepted.length})</h3>
        {byClass.length === 0 ? (
          <p className="text-sm text-neutral-500">Todavía no hay alumnos inscritos.</p>
        ) : (
          byClass.map(({ c, students }) => (
            <div key={c.id} className="space-y-1">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="font-medium text-brand">{c.title}</span>
                <span className="text-xs text-neutral-500">
                  {WEEKDAYS[c.weekday]} {c.startTime} · {enrolledLabel(c)}
                </span>
                {c.chatId && (
                  <Link href={`/chat/${c.chatId}`} className="text-xs text-brand hover:underline">
                    💬 Chat de la clase
                  </Link>
                )}
              </div>
              <ul className="space-y-1 pl-3">
                {students.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 text-sm">
                    <span className="min-w-0 flex-1 truncate">{e.userName}</span>
                    <button
                      type="button"
                      className="text-xs text-neutral-500 hover:text-red-300"
                      disabled={busy === e.id}
                      onClick={() =>
                        setConfirm({
                          title: 'Quitar de la clase',
                          message: `¿Sacar a ${e.userName} de "${c.title}"? Sale del chat de la clase y deja de ver sus videos.`,
                          confirmLabel: 'Quitar',
                          danger: true,
                          onConfirm: () => void act(e.id, () => academiesApi.removeEnrollment(a.id, e.id)),
                        })
                      }
                    >
                      Quitar
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </Card>
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}
