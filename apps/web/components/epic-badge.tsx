/**
 * Pill "Épica" (morado brillante) para las canciones top por reproducciones/día:
 * las 50 mejores de cada estilo (bachata/salsa por separado), de los últimos 24
 * meses según la fecha de subida.
 */
export function EpicBadge() {
  return (
    <span
      title="Top 50 en reproducciones/día de su estilo (últimos 24 meses)"
      className="ml-2 inline-flex shrink-0 items-center gap-0.5 rounded-full bg-gradient-to-r from-violet-500 via-purple-500 to-fuchsia-500 px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none tracking-wide text-white shadow-[0_0_10px_rgba(168,85,247,0.8)]"
    >
      🔥 Épica
    </span>
  );
}
