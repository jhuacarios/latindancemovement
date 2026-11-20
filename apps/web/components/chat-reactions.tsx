'use client';

import { useEffect, useRef, useState } from 'react';
import { CHAT_REACTIONS, type ChatReactionSummary } from '@baile-latino/types';
import { clsx } from '@/components/clsx';

/** Botón 😊 que abre la fila de emojis para reaccionar (aparece al pasar el mouse por el mensaje). */
export function ReactionPicker({
  mine,
  onPick,
}: {
  /** Mi reacción actual (se marca en la fila). */
  mine: string | null;
  onPick: (emoji: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div ref={ref} className="relative self-center">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Reaccionar"
        title="Reaccionar"
        className={clsx(
          'rounded-full p-1 text-base leading-none text-neutral-500 transition hover:bg-neutral-800 hover:text-neutral-200',
          open ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus:opacity-100',
        )}
      >
        😊
      </button>
      {open && (
        <div className="absolute bottom-full left-1/2 z-20 mb-1 flex -translate-x-1/2 gap-0.5 rounded-full border border-neutral-700 bg-neutral-900 px-1.5 py-1 shadow-xl">
          {CHAT_REACTIONS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => {
                setOpen(false);
                onPick(e);
              }}
              className={clsx(
                'rounded-full px-1 text-xl leading-8 transition hover:scale-125',
                mine === e && 'bg-brand/25',
              )}
            >
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Contadores de reacciones bajo el globo; tocar uno pone o quita esa reacción. */
export function ReactionChips({
  reactions,
  onToggle,
  alignEnd,
}: {
  reactions: ChatReactionSummary[];
  onToggle: (emoji: string) => void;
  alignEnd: boolean;
}) {
  if (reactions.length === 0) return null;
  return (
    <div className={clsx('-mt-1.5 flex flex-wrap gap-1', alignEnd ? 'justify-end pr-2' : 'pl-2')}>
      {reactions.map((r) => (
        <button
          key={r.emoji}
          type="button"
          onClick={() => onToggle(r.emoji)}
          title={r.names.join(', ') + (r.count > r.names.length ? ` y ${r.count - r.names.length} más` : '')}
          className={clsx(
            'relative z-10 flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs transition',
            r.mine
              ? 'border-brand/60 bg-brand/20 text-neutral-100'
              : 'border-neutral-700 bg-neutral-900 text-neutral-300 hover:border-neutral-500',
          )}
        >
          <span>{r.emoji}</span>
          {r.count > 1 && <span className="tabular-nums">{r.count}</span>}
        </button>
      ))}
    </div>
  );
}
