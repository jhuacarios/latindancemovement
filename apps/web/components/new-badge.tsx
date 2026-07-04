/** Pill brillante "NUEVO" para canciones lanzadas hace 2 meses o menos. */
export function NewBadge() {
  return (
    <span
      title="Lanzada hace 2 meses o menos"
      className="ml-2 inline-flex shrink-0 items-center gap-0.5 rounded-full bg-gradient-to-r from-emerald-400 via-green-500 to-emerald-600 px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none tracking-wide text-neutral-900 shadow-[0_0_8px_rgba(16,185,129,0.6)]"
    >
      ✨ Nueva
    </span>
  );
}
