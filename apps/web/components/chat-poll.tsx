'use client';

import { useState } from 'react';
import {
  CHAT_POLL_MAX_OPTIONS,
  CHAT_POLL_MIN_OPTIONS,
  CHAT_POLL_OPTION_MAX,
  CHAT_POLL_QUESTION_MAX,
  type ChatPollDto,
  type CreateChatPollRequest,
} from '@baile-latino/types';
import { clsx } from '@/components/clsx';

/**
 * Encuesta dentro de un mensaje: tocar una opción vota (en las de una sola opción,
 * cambia el voto; tocar la marcada lo quita). Las barras muestran cuántos votaron.
 */
export function PollCard({
  poll,
  mine,
  onVote,
}: {
  poll: ChatPollDto;
  /** Va en mi globo (verde): colores claros. */
  mine: boolean;
  onVote: (optionIds: string[]) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [showVoters, setShowVoters] = useState(false);
  const marked = poll.options.filter((o) => o.mine).map((o) => o.id);

  const toggle = async (id: string) => {
    if (busy) return;
    const isOn = marked.includes(id);
    const next = poll.multiple
      ? isOn
        ? marked.filter((x) => x !== id)
        : [...marked, id]
      : isOn
        ? []
        : [id];
    setBusy(true);
    try {
      await onVote(next);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-64 max-w-full">
      <div className="font-semibold">📊 {poll.question}</div>
      <div className={clsx('mb-2 text-[11px]', mine ? 'text-white/70' : 'text-neutral-400')}>
        {poll.multiple ? 'Elige una o más opciones' : 'Elige una opción'}
      </div>
      <div className="space-y-1.5">
        {poll.options.map((o) => {
          const pct = poll.totalVoters ? Math.round((o.votes / poll.totalVoters) * 100) : 0;
          return (
            <button
              key={o.id}
              type="button"
              disabled={busy}
              onClick={() => void toggle(o.id)}
              className="block w-full text-left disabled:opacity-70"
            >
              <div className="flex items-center gap-2">
                <span
                  className={clsx(
                    'flex h-4 w-4 shrink-0 items-center justify-center border text-[10px]',
                    poll.multiple ? 'rounded' : 'rounded-full',
                    o.mine
                      ? mine
                        ? 'border-white bg-white text-brand'
                        : 'border-brand bg-brand text-white'
                      : mine
                        ? 'border-white/70'
                        : 'border-neutral-500',
                  )}
                  aria-hidden="true"
                >
                  {o.mine ? '✓' : ''}
                </span>
                <span className="min-w-0 flex-1 break-words">{o.text}</span>
                <span className={clsx('text-xs tabular-nums', mine ? 'text-white/80' : 'text-neutral-400')}>
                  {o.votes}
                </span>
              </div>
              <div className={clsx('ml-6 mt-1 h-1.5 overflow-hidden rounded-full', mine ? 'bg-white/25' : 'bg-neutral-700')}>
                <div
                  className={clsx('h-full rounded-full transition-all', mine ? 'bg-white' : 'bg-brand')}
                  style={{ width: `${pct}%` }}
                />
              </div>
              {showVoters && o.voters.length > 0 && (
                <div className={clsx('ml-6 mt-0.5 text-[11px]', mine ? 'text-white/75' : 'text-neutral-400')}>
                  {o.voters.join(', ')}
                  {o.votes > o.voters.length ? ` y ${o.votes - o.voters.length} más` : ''}
                </div>
              )}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => setShowVoters((v) => !v)}
        className={clsx('mt-2 text-xs font-medium hover:underline', mine ? 'text-white/85' : 'text-brand')}
      >
        {poll.totalVoters === 0
          ? 'Nadie ha votado todavía'
          : `${poll.totalVoters} ${poll.totalVoters === 1 ? 'persona votó' : 'personas votaron'} · ${showVoters ? 'ocultar votos' : 'ver votos'}`}
      </button>
    </div>
  );
}

/** Botón 📊 del composer: abre el formulario para crear una encuesta. */
export function PollButton({
  onCreate,
  disabled,
}: {
  onCreate: (req: CreateChatPollRequest) => Promise<void>;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        title="Crear encuesta"
        aria-label="Crear encuesta"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-neutral-700 text-lg text-neutral-300 transition hover:border-neutral-500 hover:text-white disabled:opacity-50"
      >
        📊
      </button>
      {open && <PollDialog onClose={() => setOpen(false)} onCreate={onCreate} />}
    </>
  );
}

function PollDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (req: CreateChatPollRequest) => Promise<void>;
}) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [multiple, setMultiple] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filled = options.map((o) => o.trim()).filter(Boolean);
  const valid = question.trim() && filled.length >= CHAT_POLL_MIN_OPTIONS;

  // Como en WhatsApp: al escribir en la última opción aparece otra vacía.
  const setOption = (i: number, v: string) => {
    setOptions((prev) => {
      const next = prev.map((o, j) => (j === i ? v : o));
      if (i === next.length - 1 && v.trim() && next.length < CHAT_POLL_MAX_OPTIONS) next.push('');
      return next;
    });
  };
  const removeOption = (i: number) =>
    setOptions((prev) => (prev.length <= CHAT_POLL_MIN_OPTIONS ? prev : prev.filter((_, j) => j !== i)));

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onCreate({ question: question.trim(), options: filled, multiple });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear la encuesta.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-5 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Crear encuesta"
      >
        <h2 className="mb-4 text-lg font-semibold">📊 Crear encuesta</h2>
        <label className="mb-1 block text-xs font-medium text-neutral-400">Pregunta</label>
        <input
          autoFocus
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={CHAT_POLL_QUESTION_MAX}
          placeholder="Ej: ¿Qué día hacemos el ensayo?"
          className="mb-4 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm focus:border-brand focus:outline-none"
        />
        <label className="mb-1 block text-xs font-medium text-neutral-400">Opciones</label>
        <div className="mb-4 max-h-72 space-y-2 overflow-y-auto">
          {options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={o}
                onChange={(e) => setOption(i, e.target.value)}
                maxLength={CHAT_POLL_OPTION_MAX}
                placeholder={`Opción ${i + 1}`}
                className="flex-1 rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm focus:border-brand focus:outline-none"
              />
              {options.length > CHAT_POLL_MIN_OPTIONS && (
                <button
                  type="button"
                  onClick={() => removeOption(i)}
                  aria-label={`Quitar opción ${i + 1}`}
                  className="rounded-lg px-2 py-1 text-neutral-500 hover:bg-neutral-800 hover:text-red-300"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
        <label className="mb-4 flex items-center justify-between gap-3 text-sm">
          <span>Permitir varias respuestas</span>
          <input
            type="checkbox"
            checked={multiple}
            onChange={(e) => setMultiple(e.target.checked)}
            className="h-4 w-4 accent-[var(--color-brand,#1a7a4e)]"
          />
        </label>
        {error && <div className="mb-3 text-xs text-red-300">{error}</div>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!valid || busy}
            className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {busy ? 'Enviando…' : 'Enviar encuesta'}
          </button>
        </div>
      </div>
    </div>
  );
}
