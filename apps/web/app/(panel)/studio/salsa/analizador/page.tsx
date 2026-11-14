import { StudioLibrary } from '@/components/studio-library';

export default function Page() {
  return (
    <StudioLibrary
      style="SALSA"
      basePath="/studio/salsa/analizador"
      title="🎚️ Analizador · Salsa"
      description="Sube una salsa y estudia dónde cae el 1 de cada frase, qué instrumentos suenan (sonero, coros, piano, metales, congas…), dónde está el montuno, el mambo y los solos. Repite tramos y baja la velocidad sin cambiar el tono."
    />
  );
}
