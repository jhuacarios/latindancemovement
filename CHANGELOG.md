# Changelog

Todos los cambios notables de la plataforma se documentan acá.
Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/),
y la versión sigue [SemVer](https://semver.org/lang/es/).

La versión visible en la app sale de `apps/web/package.json` y se muestra al pie
del sidebar.

## [0.2.0] - 2026-06-25

### Agregado

- **Playlists YouTube**: nueva sub-sección que trae a la vista las playlists de
  la cuenta de YouTube del usuario (la sección anterior pasó a llamarse
  "Playlists Internas").
- **Detalle de playlist**: página con la lista de videos, duración total exacta
  (traída desde la API de YouTube) y enlace para abrir en YouTube.
- **Match con el catálogo**: cada video indica si está **En Catálogo**, **En Mis
  Canciones** o ambos, con su estilo, sub-estilos, duración y año.
- **Contadores por playlist**: cuántas en Mis Canciones, cuántas en el catálogo y
  cuántas externas, tanto en cada tarjeta de la lista como en el detalle.
- **Reproducción**: botones de audio/video en cada canción del detalle (estén o
  no en el sistema).
- **Agregar desde la playlist**: botón "+ Mis Canciones" para guardar una canción
  (existente o nueva personal); el super admin además puede "+ Catálogo".
- **Eliminar playlists**: borrado individual y selección múltiple, con diálogo de
  confirmación estilizado.
- **Versionamiento**: la versión de la app se muestra al pie del sidebar.

### Cambiado

- Sub-estilos: ahora **bachata también permite hasta 4** (igual que salsa).
- Export/Import Excel del catálogo: usa la columna **Sub-estilos** (categorización
  del catálogo) en vez de los tags personales.
- Los formularios de agregar canción ya **no vienen con un estilo precargado**:
  hay que elegirlo explícitamente.
- Diálogo de confirmación unificado y con ícono de advertencia para acciones
  destructivas.

### Corregido

- El reproductor no se actualizaba al pasar de una canción bloqueada a otra
  (las externas compartían la misma key); ahora se remonta por `videoId`.
- Los botones de reproducir ahora reflejan al instante cuándo un video no se
  puede reproducir fuera de YouTube, incluso en canciones externas.

## [0.1.0] - 2026-06

### Agregado

- Base de la plataforma: módulo de Música y DJs (catálogo, Mis Canciones,
  playlists internas, reportes), autenticación (incl. login con Google),
  control de permisos por rol y administración.
