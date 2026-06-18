# @baile-latino/api

API NestJS (Fastify + Prisma) de la Baile Latino Platform. Primer módulo: **Música y DJs**.

## Requisitos
- Node >= 20, pnpm 9 (instalado con `npm i -g pnpm`).

## Puesta en marcha (desde la raíz del monorepo)

```bash
pnpm install
cp apps/api/.env.example apps/api/.env   # ya hay un .env de dev incluido
pnpm db:generate                          # genera el cliente Prisma
pnpm db:push                              # crea las tablas en SQLite (dev.db)
pnpm db:seed                              # datos de prueba (DJ + canciones)
pnpm dev:api                              # levanta la API en http://localhost:3000/api/v1
```

Usuario demo: `dj@bailelatino.cl` / `password123`.

## Autenticación
JWT (access + refresh). Obtén un token con `POST /auth/login` y úsalo como
`Authorization: Bearer <accessToken>`.

## Endpoints principales (prefijo `/api/v1`)

### Auth
- `POST /auth/register` — registro (email, password, name, role, styles)
- `POST /auth/login` — login → `{ user, tokens }`
- `POST /auth/refresh` — renueva tokens
- `GET  /auth/me` — usuario actual (requiere token)

### Canciones — `/music/tracks`
- `GET    /music/tracks` — lista con filtros (`search, style, substyle, source, bpmMin, bpmMax, sort, page, pageSize`)
- `GET    /music/tracks/export.xlsx` — descarga el catálogo en Excel (respeta filtros)
- `GET    /music/tracks/:id`
- `POST   /music/tracks` — crear (pega un `link` de Spotify/YouTube, o `source`+`sourceId`)
- `POST   /music/tracks/import` — carga masiva por JSON (`{ tracks: [...] }`)
- `PATCH  /music/tracks/:id`
- `DELETE /music/tracks/:id`

### Playlists — `/music/playlists`
- `GET    /music/playlists` — playlists del usuario
- `GET    /music/playlists/:id` — con sus canciones ordenadas
- `POST   /music/playlists` — crear
- `POST   /music/playlists/generate` — **generación automática** por filtros/recomendaciones
- `PATCH  /music/playlists/:id`
- `DELETE /music/playlists/:id`
- `POST   /music/playlists/:id/items` — agregar canción
- `DELETE /music/playlists/:id/items/:itemId` — quitar canción
- `PATCH  /music/playlists/:id/reorder` — reordenar (`{ itemIds: [...] }`)

### Reportes — `/music/reports`
- `GET /music/reports/catalog` — resumen del catálogo
- `GET /music/reports/top-requested?limit=20` — más solicitadas
- `GET /music/reports/playlist/:id` — mix real vs objetivo, duración, warmup

## Generación automática (ejemplo)

```jsonc
POST /music/playlists/generate
{
  "bachataPct": 60,        // 60% bachata, 40% salsa
  "bpmMin": 120, "bpmMax": 135,
  "maxTracks": 25,
  "byPopularity": true,    // recomendación: prioriza las más solicitadas
  "name": "Social Viña - Sábado"  // si lo envías, se guarda como playlist
}
```
