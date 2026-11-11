import { redirect } from 'next/navigation';

/** Estudio se divide por estilo (cada uno con sus reglas); por ahora solo bachata. */
export default function StudioPage() {
  redirect('/studio/bachata');
}
