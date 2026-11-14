import { redirect } from 'next/navigation';

/** Estudio se divide por estilo y cada uno tiene su Analizador. */
export default function Page() {
  redirect('/studio/bachata/analizador');
}
