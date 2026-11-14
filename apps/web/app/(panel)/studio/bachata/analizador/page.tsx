import { StudioLibrary } from '@/components/studio-library';

export default function Page() {
  return (
    <StudioLibrary
      style="BACHATA"
      basePath="/studio/bachata/analizador"
      title="🎚️ Analizador · Bachata"
      description="Sube una bachata y estudia dónde cae el 1 de cada frase, qué instrumentos suenan, dónde está el derecho y el mambo, y sus breaks. Repite tramos y baja la velocidad sin cambiar el tono."
    />
  );
}
