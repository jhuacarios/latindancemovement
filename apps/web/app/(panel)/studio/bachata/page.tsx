import { redirect } from 'next/navigation';

/** Bachata abre su Analizador (ruta antigua: /studio/bachata). */
export default function Page() {
  redirect('/studio/bachata/analizador');
}
