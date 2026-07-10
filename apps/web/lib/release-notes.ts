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
    version: '0.7.9',
    date: '2026-07-10',
    module: 'music.spotify.playlists',
    type: 'fix',
    title: 'Tus playlists de Spotify ahora sí muestran las canciones',
    description:
      'Spotify bloquea leer las canciones de una playlist desde la API (aunque sea pública), así que ahora las leemos del reproductor incrustado público —igual que el importador— y sí aparecen con su match al catálogo. Solo funciona con playlists públicas: si es privada, un aviso te dice que la hagas pública. Además, la lista ya no reintenta sola cuando Spotify limita las solicitudes (eso alargaba la espera).',
  },
  {
    version: '0.7.8',
    date: '2026-07-09',
    module: 'music',
    type: 'improvement',
    title: 'Catálogo de a 250 por página (la búsqueda sigue cubriendo todo)',
    description:
      'El catálogo (YouTube y Spotify) ahora se muestra de a 250 canciones por página. La búsqueda, el filtro de estilo y el orden siguen operando sobre TODO el catálogo, no solo la página visible.',
  },
  {
    version: '0.7.8',
    date: '2026-07-09',
    module: 'music.spotify.playlists',
    type: 'fix',
    title: 'Playlists de Spotify más livianas y con errores claros',
    description:
      'La lista de playlists de Spotify ya no calcula los conteos de cada una (eso disparaba el límite de solicitudes de Spotify): muestra imagen y nombre. Al abrir una playlist, si Spotify no permite leerla (playlists generadas por Spotify) o limita las solicitudes, ahora se avisa claramente en vez de quedar en blanco.',
  },
  {
    version: '0.7.7',
    date: '2026-07-08',
    module: 'music',
    type: 'improvement',
    title: 'Detalle de playlist: pills, columnas configurables y Repr./día',
    description:
      'El detalle de una playlist interna muestra las pills “✨ Nueva” y “🔥 Épica” en cada canción, tiene el menú ⚙️ Columnas para mostrar u ocultar columnas (se recuerda tu preferencia) y agrega la columna “Repr./día” (reproducciones por día) en YouTube.',
  },
  {
    version: '0.7.6',
    date: '2026-07-08',
    module: 'music',
    type: 'improvement',
    title: 'Panel “Agregar canciones” con pills y filtros',
    description:
      'Al armar una playlist, el panel de agregar muestra las pills “✨ Nueva” y “🔥 Épica” en cada canción, tiene filtros “Nuevas” y “Épicas” (que cargan todo el catálogo, no solo la primera página), las etiquetas de estilo se compactan a “B/S”, y el buscador tiene una ✕ para limpiarlo.',
  },
  {
    version: '0.7.6',
    date: '2026-07-08',
    module: 'music',
    type: 'improvement',
    title: 'Columna “Fecha” en el detalle de la playlist',
    description:
      'El detalle de una playlist interna muestra la columna “Fecha” con mes y año (fecha de lanzamiento en Spotify, fecha de subida en YouTube) en vez de solo el año.',
  },
  {
    version: '0.7.5',
    date: '2026-07-08',
    module: 'music.spotify.catalog',
    type: 'improvement',
    title: 'Fecha (mes y año) al importar playlist de Spotify',
    description:
      'Al importar una playlist de Spotify al catálogo, la columna ahora dice “Fecha” y muestra mes y año cuando Spotify lo entrega (ej. “abr 2017”); si solo hay año, muestra el año. Es la fecha de lanzamiento real del álbum.',
  },
  {
    version: '0.7.4',
    date: '2026-07-08',
    module: 'music',
    type: 'feature',
    title: 'Épicas también en Spotify (heredadas de YouTube)',
    description:
      'Spotify no expone reproducciones, así que las Épicas se heredan desde YouTube: una canción de Spotify se marca “🔥 Épica” solo si coincide con una Épica de YouTube en título, artista, estilo y duración (±5s). También está el filtro “Solo épicas” en el catálogo y Mis Canciones de Spotify.',
  },
  {
    version: '0.7.3',
    date: '2026-07-07',
    module: 'music.youtube.playlists',
    type: 'improvement',
    title: 'Reconectar YouTube y errores de cuota más claros',
    description:
      'Si tu conexión de YouTube venció, aparece el botón “Conectar cuenta de YouTube” ahí mismo para reconectar. Y cuando se agota la cuota diaria de YouTube, se muestra un aviso claro (“reintenta después de medianoche hora del Pacífico”) — sin botón de reconectar, porque eso no arregla la cuota.',
  },
  {
    version: '0.7.1',
    date: '2026-07-05',
    module: 'music',
    type: 'improvement',
    title: 'Resumen de la playlist más visible',
    description:
      'En el panel de playlist, el conteo de bachatas/salsas y la duración total se ven más destacados. Además se quitó del generador la opción “priorizar más solicitadas” (todavía no hay datos de solicitudes que la respalden).',
  },
  {
    version: '0.7.0',
    date: '2026-07-05',
    module: 'music',
    type: 'feature',
    title: 'Canciones “Épicas” (las más top)',
    description:
      'Las 50 canciones con más reproducciones por día de cada estilo se marcan con “🔥 ÉPICA” (en bachata, de los últimos 24 meses). Hay un filtro “Solo épicas” para verlas de un vistazo.',
  },
  {
    version: '0.7.0',
    date: '2026-07-05',
    module: 'music',
    type: 'improvement',
    title: 'Mis Canciones con los mismos filtros y columnas del catálogo',
    description:
      'Mis Canciones ahora tiene sub-estilos con selección múltiple, filtros “Solo nuevas”, “Solo épicas” y “Últimos meses”, columnas configurables (engranaje), numeración de filas, columna Fecha (mes y año) y Repr./día.',
  },
  {
    version: '0.7.0',
    date: '2026-07-05',
    module: 'music',
    type: 'improvement',
    title: 'Panel de playlist: resumen y alerta de duplicados',
    description:
      'Al armar una playlist ves cuántas bachatas y salsas lleva y la duración total. Te avisa si hay canciones repetidas o muy parecidas (por título/artista), y al agregar una similar te lo advierte. Las etiquetas de estilo se compactan a “B/S” por espacio.',
  },
  {
    version: '0.7.0',
    date: '2026-07-05',
    module: 'general',
    type: 'improvement',
    title: 'Botón de reproducir con play/pausa',
    description:
      'El botón de reproducir del catálogo y Mis Canciones ahora es redondo y refleja el estado: cambia entre ▶ y ⏸, y al clickearlo alterna reproducir/detener.',
  },
  {
    version: '0.7.0',
    date: '2026-07-05',
    module: 'music',
    type: 'improvement',
    title: 'Aviso cuando se agota la cuota de YouTube',
    description:
      'Al importar playlists de Spotify o YouTube, si se agota la cuota diaria de YouTube ahora se avisa claramente (antes parecía “sin resultados”). La cuota se renueva a medianoche hora del Pacífico.',
  },
  {
    version: '0.7.0',
    date: '2026-07-05',
    module: 'music',
    type: 'improvement',
    title: 'Fecha de subida y mes al agregar o importar (YouTube)',
    description:
      'Para YouTube la fecha es la de subida del video, y al agregar una canción o importar una playlist el mes se precarga desde YouTube (ya no queda solo el año).',
  },
  {
    version: '0.6.1',
    date: '2026-07-05',
    module: 'music',
    type: 'improvement',
    title: 'Mejor importación de playlists de YouTube',
    description:
      'Al importar, la fecha de lanzamiento se calcula al instante para lo reciente y los años son más precisos (ya no confunde canciones con el mismo título de otro artista). El modal muestra el botón de play al inicio de la fila y una barra de progreso al cargar.',
  },
  {
    version: '0.6.0',
    date: '2026-07-04',
    module: 'music',
    type: 'feature',
    title: 'Columna "Fecha" de lanzamiento y canciones nuevas',
    description:
      'El catálogo muestra la fecha de lanzamiento (mes y año) y se puede ordenar por ella. Las canciones lanzadas hace 2 meses o menos se marcan con "✨ NUEVA", y hay un filtro "Solo nuevas".',
  },
  {
    version: '0.6.0',
    date: '2026-07-04',
    module: 'music',
    type: 'improvement',
    title: 'Columnas configurables y sub-estilo con selección múltiple',
    description:
      'Un engranaje en el catálogo permite mostrar u ocultar columnas (se recuerda tu preferencia). El filtro de sub-estilo ahora es de selección múltiple y muestra solo los del estilo elegido.',
  },
  {
    version: '0.6.0',
    date: '2026-07-04',
    module: 'music',
    type: 'improvement',
    title: 'Duración automática al agregar o importar (YouTube)',
    description:
      'Al agregar una canción de YouTube o importar una playlist, la duración se calcula sola desde YouTube si venía sin ella.',
  },
  {
    version: '0.6.0',
    date: '2026-07-04',
    module: 'music.spotify.catalog',
    type: 'fix',
    title: 'Importar playlist de Spotify (arreglado)',
    description:
      'La importación ahora carga bien todas las canciones, con carátula y año. Las canciones restringidas por país (que no se pueden reproducir) se marcan y no se importan.',
  },
  {
    version: '0.6.0',
    date: '2026-07-04',
    module: 'general',
    type: 'improvement',
    title: 'Canciones de Spotify restringidas por región',
    description:
      'Las canciones que Spotify no permite reproducir en tu región se marcan con 🚫 y el botón de play queda deshabilitado, indicando el motivo.',
  },
  {
    version: '0.6.0',
    date: '2026-07-04',
    module: 'admin',
    type: 'feature',
    title: '"Ver como rol" y matriz de permisos',
    description:
      'Como super admin puedes previsualizar la plataforma como cualquier rol (sin cambiar tus permisos reales) y comparar en una matriz qué puede ver o editar cada rol.',
  },
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
