import { Card } from './ui';

/** Placeholder de las secciones de Spotify mientras no exista la integración. */
export function SpotifyPlaceholder({ section }: { section: string }) {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">🟢 Spotify · {section}</h1>
        <p className="text-sm text-neutral-400">
          Integración de Spotify pendiente.
        </p>
      </div>
      <Card className="text-center">
        <div className="mb-2 text-4xl">🚧</div>
        <h2 className="text-lg font-semibold">Próximamente</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-neutral-400">
          Aquí vivirán las {section.toLowerCase()} de Spotify cuando conectemos
          la integración.
        </p>
      </Card>
    </div>
  );
}
