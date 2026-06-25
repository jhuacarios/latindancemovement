/**
 * Novedades de la app que se muestran a los usuarios en "Novedades", filtradas
 * por los módulos que cada uno puede ver (campo `module`).
 *
 * - `module`: clave de permiso (ej: 'music.youtube.ytplaylists', 'music') o
 *   'general' para mostrarla a todos.
 * - `type`: 'feature' (nuevo) | 'improvement' (mejora) | 'fix' (corrección).
 *
 * Para anunciar algo nuevo: agrega una entrada ARRIBA del array con la fecha de
 * hoy y la versión correspondiente.
 */
export type ReleaseNoteType = 'feature' | 'improvement' | 'fix';

export interface ReleaseNote {
  version: string;
  /** Fecha en formato YYYY-MM-DD (se usa para ordenar y marcar "visto"). */
  date: string;
  /** Clave de permiso del módulo, o 'general'. */
  module: string;
  type: ReleaseNoteType;
  title: string;
  description?: string;
}

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: '0.2.0',
    date: '2026-06-25',
    module: 'music.youtube.ytplaylists',
    type: 'feature',
    title: 'Playlists de YouTube',
    description:
      'Trae a la vista las playlists de tu cuenta de YouTube, con detalle, duración total y reproducción dentro de la app.',
  },
  {
    version: '0.2.0',
    date: '2026-06-25',
    module: 'music.youtube.ytplaylists',
    type: 'feature',
    title: 'Match con el catálogo',
    description:
      'Cada canción de una playlist indica si está En Catálogo o En Mis Canciones, con su estilo, sub-estilos y duración. Las externas se pueden agregar con un clic.',
  },
  {
    version: '0.2.0',
    date: '2026-06-25',
    module: 'music.youtube.catalog',
    type: 'improvement',
    title: 'Export/Import con sub-estilos',
    description:
      'El Excel del catálogo ahora exporta e importa la columna de Sub-estilos (la categorización real del catálogo).',
  },
  {
    version: '0.2.0',
    date: '2026-06-25',
    module: 'music.youtube.catalog',
    type: 'improvement',
    title: 'Bachata permite hasta 4 sub-estilos',
    description: 'Antes eran 3; ahora bachata y salsa permiten hasta 4 sub-estilos.',
  },
  {
    version: '0.2.0',
    date: '2026-06-25',
    module: 'general',
    type: 'fix',
    title: 'Reproductor más estable',
    description:
      'Se corrigió que el control de abajo quedara pegado al pasar de una canción bloqueada a otra, y ahora marca al instante los videos que no se pueden reproducir fuera de YouTube.',
  },
  {
    version: '0.2.0',
    date: '2026-06-25',
    module: 'general',
    type: 'feature',
    title: 'Versión visible',
    description:
      'Abajo a la derecha ahora se ve la versión de la app, para saber con qué build estás trabajando.',
  },
];
