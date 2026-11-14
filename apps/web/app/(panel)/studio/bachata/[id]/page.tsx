import { redirect } from 'next/navigation';

/** Ruta antigua de una canción: ahora vive bajo el Analizador. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/studio/bachata/analizador/${id}`);
}
