import type { AcademyMediaKind } from '@baile-latino/types';

/** Utilidades de archivos de media compartidas por academias y sociales. */

export const THUMB_MIME = 'image/jpeg';

/** Inicio del mensaje de un archivo repetido: el web lo usa para saltarlo sin cortar el lote. */
export const DUPLICATE_PREFIX = 'Ya está en la galería:';

export const EXT: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export const kindOf = (mime: string): AcademyMediaKind => (mime.startsWith('image/') ? 'PHOTO' : 'VIDEO');

/** Nombre al descargar: el título con su extensión. */
export function downloadName(v: { title: string; mimeType: string }): string {
  const ext = EXT[v.mimeType];
  return ext && !/\.[a-z0-9]{2,4}$/i.test(v.title) ? `${v.title}.${ext}` : v.title;
}

/** "YYYY-MM-DD" → Date a mediodía UTC (evita correrse de día por zona horaria). */
export const ymdToDate = (ymd: string | null | undefined) => (ymd ? new Date(`${ymd}T12:00:00Z`) : null);
