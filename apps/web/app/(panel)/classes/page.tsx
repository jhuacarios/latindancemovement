import { redirect } from 'next/navigation';

/** "Clases y Bootcamps" ahora es Academias. */
export default function ClassesPage() {
  redirect('/academies');
}
