# PRD — Módulo de Música y DJs

> Baile Latino Platform · Módulo 6 (MVP / Fase 1) · `apps/api/src/music/` — Sprint 7
> Versión 0.3 · Junio 2026 · Chile
> Estado: **alcance congelado** — alineado a CLAUDE.md; decisiones P1–P8 tomadas. Listo para diseño técnico.

---

## 1. Contexto

La Baile Latino Platform es un **monorepo (Turborepo + pnpm)** con una sola API NestJS
(modular monolith) que sirve a `apps/web` (Next.js, organizador + admin) y `apps/mobile`
(Expo, comunidad). Este PRD cubre el **Módulo de Música y DJs**, que conecta a DJs,
organizadores, bailarines y artistas alrededor de la música de cada evento.

Es parte del **MVP (Fase 1)** y se implementa como `MusicModule` en `apps/api/src/music/`
(Sprint 7, después de Auth, Eventos, Pagos, Acceso y Chat IA). El primer entregable es la
**API**; el consumo desde web/mobile viene en Sprints 8–9.

El módulo se apoya en otros módulos (Auth/Perfiles, Eventos, Créditos) y alimenta a
Coreografía (warmup, capas de audio) y al Marketplace de Talento (perfil del DJ/artista).
Aquí definimos solo lo que pertenece a Música y DJs.

---

## 2. Problema

- Los DJs no tienen datos de qué funciona en cada región: programan por intuición (Santiago vs Viña).
- Los bailarines no saben qué se va a pinchar y no tienen forma de pedir/influir en la música.
- La curaduría entre varios DJs de un mismo evento se coordina por WhatsApp, sin orden ni versión única.
- Los artistas emergentes dependen de Instagram para mostrar música nueva; no hay canal con contexto de baile.
- El conocimiento de "qué pega" (por estilo, región, momento de la noche) se pierde evento tras evento.

---

## 3. Objetivos y métricas de éxito

| Objetivo | Métrica | Meta inicial (piloto Viña) |
|---|---|---|
| Que el público sepa y opine sobre la música | % de asistentes que ven la playlist del evento | ≥ 40% |
| Subir el engagement pre-evento | Votos/solicitudes de canciones por evento | ≥ 30 |
| Facilitar curaduría colaborativa | Eventos con ≥ 2 DJs usando el comité musical | ≥ 1 en piloto |
| Sembrar la base de datos musical | Tracks catalogados con estilo + metadata | ≥ 500 al cierre Fase 1 |
| Dar valor a artistas emergentes | Canciones nuevas subidas al canal de lanzamiento | ≥ 10 al cierre Fase 1 |

> *Las preguntas abiertas P1–P2 (ver §13) afectan estas metas.*

---

## 4. Usuarios y roles

Roles del sistema (enum de Auth): `BAILARIN`, `ORGANIZADOR`, `PROFESOR`, `DJ`, `ARTISTA`,
`COREOGRAFO`, `FILMMAKER`, `VENUE`, `SUPER_ADMIN`.

- **DJ** (primario): arma y publica playlists, modera solicitudes, ve tendencias, programa el warmup.
- **DJ del comité** (hasta 3 por evento): co-cura una playlist compartida.
- **ORGANIZADOR**: asigna el/los DJ al evento, define el mix % bachata/salsa, aprueba la playlist.
- **BAILARIN/asistente**: ve la playlist anticipada, reproduce, solicita y vota canciones, vota novedades.
- **ARTISTA emergente**: sube canciones al canal de lanzamiento, las vincula a su perfil.
- **SUPER_ADMIN**: modera contenido, gestiona el catálogo maestro, gobierna la data premium.

Estilos/sub-estilos (enum): `BACHATA_SENSUAL`, `BACHATA_TRADICIONAL`, `BACHATA_URBANA`,
`SALSA_ON1`, `SALSA_ON2`, `SALSA_CUBANA`.

---

## 5. Alcance

### Dentro de alcance
1. Catálogo de tracks híbrido (Spotify + YouTube) por estilo y sub-estilo.
2. Playlist del evento **híbrida** (tracks de Spotify y YouTube en la misma lista) con distribución % bachata/salsa.
3. Reproducción in-app: Spotify Web Playback SDK (Premium) + preview 30s fallback; YouTube iFrame API.
4. Solicitud y votación de canciones por parte de asistentes.
5. Comité musical colaborativo (hasta 3 DJs) sobre una playlist compartida.
6. Warmup del evento (set/playlist pre-show).
7. Canal de lanzamiento para artistas emergentes + votación comunitaria de novedades.
8. Tendencias en tiempo real durante el evento.
9. Data premium de canciones por región (feature monetizable).

### Fuera de alcance (de este módulo)
- Mezcla en vivo / control del set durante el evento (no reemplaza el software del DJ).
- Capas de audio para ensayo (subir/bajar clave, bongó, bajo) → pertenece a **Coreografía**.
- Hosting de audio propio (solo se enlaza/reproduce vía Spotify/YouTube).
- Contratación del DJ y reseñas → pertenece a **Marketplace de Talento**.
- Cobro de la data premium / suscripciones → la lógica vive en **Créditos/Pagos**; aquí solo el contenido y el control de acceso.

### Orden de construcción dentro del módulo
Para "que cada pieza funcione antes de la siguiente": **(a)** catálogo + playlist híbrida + reproducción →
**(b)** solicitudes + votación → **(c)** comité musical → **(d)** warmup → **(e)** canal de lanzamiento →
**(f)** tendencias en vivo → **(g)** data premium por región.

---

## 6. User stories

**Bailarín**
- Como asistente, quiero ver la playlist del evento antes de ir, para saber si me gusta el ambiente.
- Como asistente, quiero reproducir cada track (o su preview) sin salir de la app.
- Como asistente, quiero solicitar una canción y votar las de otros, para influir en la noche.
- Como asistente, quiero votar canciones nuevas, para descubrir y apoyar artistas.

**DJ**
- Como DJ, quiero construir una playlist mezclando Spotify y YouTube, para no limitarme a una fuente.
- Como DJ, quiero ver y moderar las solicitudes ordenadas por votos, para decidir qué incluir.
- Como DJ, quiero co-curar con otros DJs en una sola lista, para no coordinar por WhatsApp.
- Como DJ, quiero ver tendencias en vivo durante el evento, para leer la pista y ajustar.
- Como DJ, quiero ver qué pega por estilo/región, para programar mejor (premium).

**Organizador**
- Como organizador, quiero asignar DJ(s) y aprobar la playlist, para mantener la línea del evento y el mix %.

**Artista emergente**
- Como artista, quiero subir una canción nueva con su contexto, para que la comunidad la descubra y vote.

---

## 7. Requisitos funcionales

### 7.1 Catálogo de tracks (`Track`)
- RF-01 Cada `Track` tiene: título, artista, estilo, sub-estilo, BPM, año, **fuente** (`SPOTIFY`|`YOUTUBE`), `sourceId`, portada, duración.
- RF-02 Se crea un track enlazando Spotify o YouTube; la metadata base se autocompleta vía API y el DJ la corrige (estilo/sub-estilo/BPM).
- RF-03 **Búsqueda simultánea** en Spotify Web API y YouTube Data API v3; resultados unificados con la fuente marcada.
- RF-04 Catálogo maestro deduplicado: un track = un registro, aunque aparezca en varias playlists. Dedupe por (`source`,`sourceId`) y heurística título+artista entre fuentes.
- RF-05 Filtro por estilo, sub-estilo y rango de BPM.

### 7.2 Playlist del evento (`Playlist`)
- RF-06 Un evento tiene una playlist; el DJ agrega tracks del catálogo o nuevos (Spotify y/o YouTube en la misma lista).
- RF-07 La playlist refleja y monitorea el **mix % bachata/salsa** del evento (indicador de balance objetivo vs real).
- RF-08 Estados: `BORRADOR → PUBLICADA → ARCHIVADA` (post-evento).
- RF-09 Solo el DJ asignado / comité edita; el ORGANIZADOR aprueba el paso a `PUBLICADA`.
- RF-10 Al publicarse, los asistentes (o seguidores del evento) reciben notificación segmentada por estilo (Expo Push / FCM).
- RF-11 **Visibilidad configurable por evento** (decisión P1): el ORGANIZADOR elige `PUBLICA` (cualquiera la ve) o `SOLO_ENTRADA` (solo quien compró). Default sugerido: `SOLO_ENTRADA`.
- RF-11b Orden de tracks configurable (drag); marca de track de warmup (ver 7.6).

### 7.3 Reproducción in-app
- RF-12 **Prioridad piloto (decisión P8)**: YouTube es la fuente de reproducción completa (iFrame API); Spotify se sirve por **preview de 30s**. El **Web Playback SDK** (reproducción completa Spotify, requiere Premium) es *nice to have* y se difiere.
- RF-13 (Diferido) Reproducción completa de Spotify vía Web Playback SDK cuando el usuario tenga Premium.
- RF-14 La UI indica claramente cuándo es reproducción completa vs preview de 30s.
- RF-15 Degradación elegante: si una fuente falla, el resto de la playlist sigue visible y reproducible.

### 7.4 Solicitudes y votación del público
- RF-16 Un asistente solicita un track (buscando en catálogo o enlazando Spotify/YouTube).
- RF-17 Otros asistentes votan las solicitudes; la vista del DJ ordena por votos en tiempo real (Socket.io).
- RF-18 El DJ acepta (mueve a la playlist), rechaza o marca "quizás" una solicitud. **La votación es solo insumo: nunca entra una canción automáticamente** (decisión P2).
- RF-19 Límite anti-spam (decisión P3): máximo **5 solicitudes activas** y **20 votos** por usuario por evento (valores ajustables por config).
- RF-20 **Las solicitudes y votos permanecen abiertos durante el evento** (decisión P3); se cierran al pasar la playlist a `ARCHIVADA`. Esto alimenta las tendencias en tiempo real (RF-30).

### 7.5 Comité musical colaborativo
- RF-21 El ORGANIZADOR o DJ principal invita hasta 3 DJs a co-curar la playlist del evento.
- RF-22 Todos editan la misma playlist; los cambios se ven en tiempo real (Socket.io).
- RF-23 Autoría por ítem: registro de quién agregó/quitó cada track.
- RF-24 (Posterior) Control de versiones / resolución de conflictos en edición concurrente.

### 7.6 Warmup del evento
- RF-25 El DJ define un set de warmup (orden de tracks para la apertura), distinguible del cuerpo de la playlist.

### 7.7 Canal de lanzamiento y votación de novedades
- RF-26 Un `ARTISTA` sube una canción nueva (enlace + metadata + descripción/contexto). Estado inicial `PENDIENTE_APROBACION`.
- RF-26b **Moderación previa (decisión P5)**: un `SUPER_ADMIN` aprueba o rechaza antes de que la novedad se publique en el canal.
- RF-27 La comunidad descubre las novedades aprobadas en un feed dedicado y vota.
- RF-28 Las canciones del canal se pueden añadir a playlists de eventos.
- RF-29 La canción queda vinculada al perfil del artista (puente al Marketplace de Talento).

### 7.8 Tendencias y data premium
- RF-30 **Tendencias en tiempo real durante el evento**: tracks más solicitados/votados/reproducidos, por estilo.
- RF-31 Tendencias agregadas históricas por estilo y por región.
- RF-32 **Data premium para DJs (decisión P6)**: suscripción **individual del DJ**, con granularidad por **ciudad** (Santiago, Viña, …): ranking por ciudad, evolución temporal y "qué pega" por momento de la noche. El cobro de la suscripción vive en el módulo Créditos/Pagos; aquí solo el contenido y el gate de acceso.
- RF-33 La data premium se genera **agregada y anonimizada** a partir de solicitudes/votos/playlists/reproducciones.

---

## 8. Requisitos no funcionales

- **Backend**: NestJS 10 (Fastify adapter), TypeScript strict; `MusicModule` con `music.module.ts` + `music.controller.ts` + `music.service.ts` + DTOs validados con `class-validator`/`class-transformer`.
- **API**: prefijo `/api/v1`; rutas protegidas con `@UseGuards(JwtAuthGuard)` y guard de rol donde aplique; respuestas tipadas con interfaces de `@baile-latino/types`.
- **ORM/DB**: Prisma 5; PostgreSQL en prod, SQLite (`file:./dev.db`) en dev.
- **Tiempo real**: Socket.io (`@nestjs/platform-socket.io`) para votación/comité/tendencias en vivo; latencia objetivo < 2 s.
- **Jobs**: BullMQ + Redis para sync de metadata externa y cómputo de tendencias/data premium.
- **Privacidad**: data premium agregada y anonimizada, sin exponer votos individuales (Ley 19.628).
- **Rendimiento**: catálogo y búsqueda fluidos con ≥ 10.000 tracks.
- **Resiliencia a terceros**: degradación elegante ante fallos/cuotas de Spotify/YouTube.
- **Errores**: `HttpException` / filtros globales, nunca `throw new Error` sin capturar.

---

## 9. Integraciones

- **Spotify Web API** (búsqueda/metadata) + **Web Playback SDK** (reproducción, requiere Premium) + preview 30s fallback. Vars: `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`.
- **YouTube Data API v3** (búsqueda/metadata) + **iFrame API** (reproducción). Var: `YOUTUBE_API_KEY`.
- **Expo Push / Firebase FCM**: notificación de playlist publicada, segmentada por estilo.
- **Módulos internos**: Auth/Perfiles (DJ, artista, roles), Eventos (mix %, asistentes), Créditos/Pagos (suscripción premium), Coreografía (warmup/audio), Marketplace de Talento (perfil del DJ/artista).

> Verificar cuotas y términos de uso de cada API (especialmente límites del Web Playback SDK y de la YouTube Data API).

---

## 10. Modelo de datos (alto nivel)

Tipos base viven en `packages/types/src/index.ts` (`Track`, `Playlist`, …). Prisma en `apps/api/prisma/schema.prisma`.

- `Track`: id, título, artista, estilo, subEstilo, bpm, año, source(`SPOTIFY`|`YOUTUBE`), sourceId, portada, duración, esNovedad, estadoAprobacion(`PENDIENTE_APROBACION`|`APROBADA`|`RECHAZADA`), artistaUserId?
- `Playlist`: id, eventId, estado(`BORRADOR`|`PUBLICADA`|`ARCHIVADA`), visibilidad(`PUBLICA`|`SOLO_ENTRADA`), mixObjetivo, creadoPor
- `PlaylistItem`: id, playlistId, trackId, orden, esWarmup, agregadoPor
- `SongRequest`: id, eventId, trackId, solicitanteId, estado(`PENDIENTE`|`ACEPTADA`|`RECHAZADA`|`QUIZAS`), votos
- `RequestVote`: id, requestId, userId
- `CommitteeMember`: id, playlistId, djUserId
- `ReleaseVote`: id, trackId, userId
- `TrendSnapshot` (agregado): región, estilo, trackId, score, periodo

> Cambios a `schema.prisma` y a `packages/types` requieren discusión previa (ver CLAUDE.md — "Lo que NO tocar").

---

## 11. Dependencias y supuestos

- Requiere **AuthModule** (roles DJ/artista/asistente) — Sprint 2.
- Requiere **EventsModule** para asociar playlist a evento y conocer mix % y asistentes — Sprint 3.
- La monetización premium depende de **CreditsModule** (Fase 2) — el módulo de Música expone el contenido y el gate; el cobro es externo.
- Supone acceso aprobado a Spotify y YouTube APIs, y que la reproducción Spotify completa exige Premium del usuario.

---

## 12. Decisiones tomadas

| # | Decisión | Resultado |
|---|---|---|
| P1 | Visibilidad de la playlist | **Configurable por evento** (`PUBLICA` / `SOLO_ENTRADA`); default `SOLO_ENTRADA`. |
| P2 | Peso de la votación | **Solo insumo**: el DJ decide; nada entra automáticamente. |
| P3 | Solicitudes y anti-spam | **Abiertas durante el evento**; máx. 5 solicitudes activas y 20 votos por usuario/evento. |
| P4 | Fuente de música | **Híbrido Spotify + YouTube** en la misma lista (desde CLAUDE.md). |
| P5 | Canal de lanzamiento | `ARTISTA` sube → **aprobación previa de `SUPER_ADMIN`**. |
| P6 | Data premium | **Suscripción por DJ**, granularidad por **ciudad**. |
| P7 | Warmup | **Dentro del MVP** (desde CLAUDE.md). |
| P8 | Reproducción (piloto) | **YouTube completo + Spotify preview 30s**; Web Playback SDK diferido. |

---

## 13. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Web Playback SDK exige Spotify Premium (pocos lo tienen) | Alto | Priorizar YouTube + preview 30s; tratar reproducción Spotify completa como opcional. |
| Límites/cambios en APIs de Spotify/YouTube (cuotas, preview) | Alto | Abstraer la fuente tras una interfaz; cachear metadata; degradación elegante. |
| Data premium con pocos datos al inicio (cold start) | Medio | Liberar premium solo con volumen; sembrar catálogo en el piloto. |
| Spam/manipulación de votos | Medio | Límites por usuario, cuenta verificada, detección de patrones. |
| Derechos de autor del contenido del canal | Medio | Solo enlaces a fuentes legítimas, sin hosting propio; T&C de subida. |
| Edición concurrente del comité | Bajo | Autoría por ítem ahora; control de versiones real más adelante. |

---

*Alcance congelado. Próximo paso sugerido: diseño técnico del `MusicModule` —
esquema Prisma (`Track`, `Playlist`, `PlaylistItem`, `SongRequest`, `RequestVote`,
`CommitteeMember`, `ReleaseVote`, `TrendSnapshot`), tipos en `@baile-latino/types`,
y endpoints `/api/v1/music/...`.*
