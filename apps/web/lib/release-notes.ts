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
    version: '0.5.0',
    date: '2026-07-02',
    module: 'general',
    type: 'feature',
    title: 'Sección de Spotify (funcional)',
    description:
      'Spotify ya no es placeholder: Mis Canciones, Catálogo, Playlists Internas y Playlists Spotify, todo separado de YouTube. Cada plataforma con lo suyo.',
  },
  {
    version: '0.5.0',
    date: '2026-07-02',
    module: 'music.spotify.playlists',
    type: 'feature',
    title: 'Conecta tu Spotify y revisa tus playlists',
    description:
      'Conecta tu cuenta de Spotify y ve tus playlists con match al catálogo (bachatas/salsas/externas), reproducción, y agrega canciones a Mis Canciones o al catálogo.',
  },
  {
    version: '0.5.0',
    date: '2026-07-02',
    module: 'music.spotify.catalog',
    type: 'feature',
    title: 'Importar playlist de Spotify al catálogo',
    description:
      'Pega una playlist de Spotify y la importa como canciones de Spotify, detectando el estilo por tu catálogo curado y por el nombre de la playlist.',
  },
  {
    version: '0.5.0',
    date: '2026-07-02',
    module: 'general',
    type: 'feature',
    title: 'Reproducir canciones de Spotify',
    description:
      'Botón de play para escuchar canciones de Spotify (preview 30s; pista completa con Premium) en Playlists, Catálogo, Mis Canciones e importador.',
  },
  {
    version: '0.5.0',
    date: '2026-07-02',
    module: 'music.youtube.playlists',
    type: 'improvement',
    title: 'Playlists internas por plataforma',
    description:
      'Cada playlist interna es de YouTube o de Spotify: se reordena, agrega y exporta con las canciones de su plataforma, sin mezclar.',
  },
  {
    version: '0.5.0',
    date: '2026-07-02',
    module: 'general',
    type: 'fix',
    title: 'Búsqueda sin acentos',
    description:
      'Buscar "mientele" ahora encuentra "Miéntele": las búsquedas ignoran acentos y mayúsculas en catálogo y Mis Canciones.',
  },
  {
    version: '0.4.7',
    date: '2026-06-30',
    module: 'music.youtube.playlists',
    type: 'feature',
    title: 'Agregar al armar la playlist desde el catálogo',
    description:
      'El panel de "Agregar canciones" ahora tiene un selector Mis Canciones / Catálogo. En Catálogo ves solo lo que aún no tienes (lo demás se filtra solo), y al agregar una también queda en Mis Canciones.',
  },
  {
    version: '0.4.7',
    date: '2026-06-30',
    module: 'music.youtube.playlists',
    type: 'improvement',
    title: 'Reproducciones en el detalle de la playlist',
    description:
      'La tabla de una playlist ahora muestra la columna Reproducciones de cada canción.',
  },
  {
    version: '0.4.6',
    date: '2026-06-30',
    module: 'music.youtube.playlists',
    type: 'feature',
    title: 'Cambiar la distribución de una playlist',
    description:
      'Nuevo botón "Cambiar distribución" para ajustar cuántas bachatas y salsas por bloque. Reordena las canciones al nuevo patrón manteniendo el orden actual de cada estilo (sin barajar).',
  },
  {
    version: '0.4.5',
    date: '2026-06-29',
    module: 'music.youtube.playlists',
    type: 'fix',
    title: 'Reconectar YouTube sin salir del modal',
    description:
      'Al crear una playlist en YouTube, si la conexión estaba vencida aparecía el error sin salida. Ahora se muestra un botón "Reconectar cuenta de YouTube" para re-autorizar al instante.',
  },
  {
    version: '0.4.4',
    date: '2026-06-29',
    module: 'music',
    type: 'improvement',
    title: 'Filtra Mis Canciones por tus tags',
    description:
      'El filtro de sub-estilos en Mis Canciones usa TUS tags (los que ves y editas). Sin ningún tag seleccionado vienen todas las del estilo. Tus canciones antiguas heredan automáticamente los sub-estilos del catálogo.',
  },
  {
    version: '0.4.4',
    date: '2026-06-29',
    module: 'music.youtube.catalog',
    type: 'feature',
    title: 'Ordenar el catálogo por reproducciones',
    description:
      'La columna Reproducciones del catálogo ahora es ordenable: clic en el encabezado para ver las más (o menos) reproducidas.',
  },
  {
    version: '0.4.3',
    date: '2026-06-29',
    module: 'general',
    type: 'fix',
    title: 'Contador de Novedades arreglado',
    description:
      'El número rojo de la campanita ahora cuenta bien las novedades sin leer, incluso cuando hay varias el mismo día (antes se contaba por fecha y se saltaba alguna).',
  },
  {
    version: '0.4.2',
    date: '2026-06-29',
    module: 'admin.roles',
    type: 'fix',
    title: 'Permisos por sección en música',
    description:
      'En la matriz de roles, los permisos de Editar/Eliminar de Mis Canciones y Catálogo ahora controlan de verdad su propia sección (antes mandaba el permiso del módulo). Las playlists son del usuario, así que se gestionan por dueñidad.',
  },
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
