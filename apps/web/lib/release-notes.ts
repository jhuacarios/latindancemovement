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
    version: '0.4.1',
    date: '2026-06-29',
    module: 'music',
    type: 'improvement',
    title: 'Tus sub-estilos en Mis Canciones',
    description:
      'Al agregar una canción a Mis Canciones, hereda los sub-estilos del catálogo y pasan a ser tuyos: edítalos a tu gusto sin afectar el catálogo ni a otros DJs. El estilo (Bachata/Salsa) lo administra el equipo.',
  },
  {
    version: '0.4.1',
    date: '2026-06-29',
    module: 'music.youtube.playlists',
    type: 'improvement',
    title: 'El generador usa tus canciones',
    description:
      'El generador automático arma las listas con tu biblioteca (Mis Canciones), respetando el patrón por bloque.',
  },
  {
    version: '0.4.0',
    date: '2026-06-29',
    module: 'general',
    type: 'feature',
    title: 'Nueva identidad: Nectason',
    description:
      'La plataforma se llama Nectason, con nuevo logo, colores y tipografía. El logo del sitio se sube desde Administración → Configuración del sitio.',
  },
  {
    version: '0.4.0',
    date: '2026-06-29',
    module: 'music',
    type: 'feature',
    title: 'Importar playlists de Spotify al catálogo',
    description:
      'Pega una playlist de Spotify y, por cada canción, se busca la mejor versión en YouTube (audio limpio para social): prioriza duración y canales oficiales, y marca en vivo/cover. Tú confirmas y puedes elegir entre versiones.',
  },
  {
    version: '0.4.0',
    date: '2026-06-29',
    module: 'music',
    type: 'feature',
    title: 'Cargar playlists de YouTube a Mis Canciones',
    description:
      'Importa una playlist pública de YouTube directo a tu biblioteca: ignora las que ya tienes, eliges el estilo con un switch y reproduces para confirmar.',
  },
  {
    version: '0.4.0',
    date: '2026-06-29',
    module: 'music',
    type: 'feature',
    title: 'Detectar y unir canciones duplicadas',
    description:
      'En el catálogo, "Buscar duplicados" encuentra la misma canción en varios videos (audio, en vivo, demos) y deja solo la que elijas, sin perderla de las playlists ni de Mis Canciones.',
  },
  {
    version: '0.4.0',
    date: '2026-06-29',
    module: 'music.youtube.playlists',
    type: 'feature',
    title: 'Playlists vacías y orden por bloques',
    description:
      'Crea una playlist solo con su distribución (ej. 5 bachatas → 3 salsas) y luego ordénala en bloques con un botón, con opción de barajar manteniendo la mezcla.',
  },
  {
    version: '0.4.0',
    date: '2026-06-29',
    module: 'music',
    type: 'improvement',
    title: 'Panel de Mis Canciones más potente',
    description:
      'Reordena con un asa, agrega con doble click, reproduce con un click, y ve resaltadas las canciones que ya están en la playlist abierta.',
  },
  {
    version: '0.4.0',
    date: '2026-06-29',
    module: 'music',
    type: 'improvement',
    title: 'Más datos en catálogo y playlists',
    description:
      'El catálogo muestra reproducciones. El detalle de playlist muestra duración, año y sub-estilos, el total de bachatas/salsas, la duración total y cuántas faltan para completar los bloques.',
  },
  {
    version: '0.4.0',
    date: '2026-06-29',
    module: 'music',
    type: 'improvement',
    title: 'Completar duraciones faltantes',
    description:
      'Un botón en el catálogo rellena de una pasada las duraciones que faltan, consultando YouTube.',
  },
  {
    version: '0.4.0',
    date: '2026-06-29',
    module: 'general',
    type: 'improvement',
    title: 'Perfil, menú y reproductor',
    description:
      'Acceso a tu perfil desde el avatar (con sub-secciones), menú lateral comprimible, y el reproductor de pie ya no tapa el final del contenido (botón circular, volumen inicial cómodo).',
  },
  {
    version: '0.4.0',
    date: '2026-06-29',
    module: 'music',
    type: 'fix',
    title: 'Búsqueda sin distinción de mayúsculas',
    description:
      'Buscar "beautiful" ahora encuentra "Beautiful" en el catálogo y en Mis Canciones.',
  },
  {
    version: '0.3.0',
    date: '2026-06-27',
    module: 'general',
    type: 'feature',
    title: 'Control de volumen',
    description:
      'El reproductor ahora tiene control de volumen, y recuerda el último nivel que usaste entre canciones y sesiones.',
  },
  {
    version: '0.3.0',
    date: '2026-06-27',
    module: 'general',
    type: 'improvement',
    title: 'Miniaturas más nítidas',
    description:
      'Las miniaturas de las canciones se ven en 16:9 completo (sin bordes negros ni recorte).',
  },
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
