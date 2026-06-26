# Deploy — sitio de pruebas

Stack del deploy: **Web → Vercel**, **API → Railway**, **DB → PostgreSQL** (Railway o Neon).

---

## 0. Antes de empezar

- La app ahora usa **PostgreSQL** (dev y prod). Para dev local necesitas Postgres:
  ```bash
  docker compose up -d db          # levanta Postgres local (ver docker-compose.yml)
  cd apps/api
  pnpm db:push                     # crea las tablas
  pnpm db:seed                     # carga catálogo + sub-estilos + usuario admin
  ```
  > Tu antiguo `dev.db` (SQLite) ya no se usa. Si quieres conservar datos locales
  > de prueba, pídelo y te paso un script de migración SQLite→Postgres.

---

## 1. Base de datos (PostgreSQL)

Crea una base en **Railway** (Add → Database → PostgreSQL) o en **Neon**.
Copia su connection string (algo como `postgresql://user:pass@host:5432/db`).

---

## 2. API en Railway

> **Ojo (Bitbucket):** Railway integra deploy automático con **GitHub**, no con
> Bitbucket. Dos opciones:
> - **Railway CLI** (sin git integration, despliega desde tu local):
>   ```bash
>   npm i -g @railway/cli
>   railway login
>   railway init           # crea el proyecto (o `railway link` a uno existente)
>   railway up             # sube y despliega
>   ```
> - O **espejar el repo a GitHub** y conectar ese.
>
> Con CLI, igual configura las variables abajo (dashboard o `railway variables set`).

1. New Project → Deploy from GitHub repo → elige este repo (o usa la CLI de arriba).
2. Railway leerá `railway.json` (build y start ya configurados).
3. **Variables** del servicio (Settings → Variables):
   ```
   DATABASE_URL=<connection string del Postgres>
   JWT_SECRET=<largo y aleatorio>
   JWT_REFRESH_SECRET=<otro largo y aleatorio>
   SUPER_ADMIN_EMAILS=jhuacarios@gmail.com
   WEB_URL=https://TU-WEB.vercel.app
   GOOGLE_OAUTH_CLIENT_ID=<...>
   GOOGLE_OAUTH_CLIENT_SECRET=<...>
   GOOGLE_LOGIN_REDIRECT_URI=https://TU-API.up.railway.app/api/v1/auth/google/callback
   GOOGLE_OAUTH_REDIRECT_URI=https://TU-API.up.railway.app/api/v1/music/youtube/callback
   YOUTUBE_API_KEY=<si la usas>
   NODE_ENV=production
   ```
   > `WEB_URL` admite varias URLs separadas por coma (útil para previews de Vercel).
4. Tras el **primer deploy**, abre la shell del servicio (o usa `railway run`) y corre **una vez**:
   ```bash
   pnpm --filter @baile-latino/api db:push
   pnpm --filter @baile-latino/api db:seed
   ```
   Esto crea las tablas y carga el catálogo (a nombre del email de `SUPER_ADMIN_EMAILS`).
5. Anota la URL pública de la API (ej: `https://TU-API.up.railway.app`).

---

## 3. Web en Vercel

1. New Project → importa este repo.
2. **Root Directory**: `apps/web`.
3. Framework: Next.js (autodetectado).
4. **Environment Variables**:
   ```
   NEXT_PUBLIC_API_URL=https://TU-API.up.railway.app/api/v1
   ```
5. Deploy. Anota la URL (ej: `https://TU-WEB.vercel.app`) y ponla en `WEB_URL` de la API.

---

## 4. Google Cloud Console (OAuth)

En tu cliente OAuth (login con Google + conexión de YouTube):

- **Authorized redirect URIs** → agrega:
  - `https://TU-API.up.railway.app/api/v1/auth/google/callback`
  - `https://TU-API.up.railway.app/api/v1/music/youtube/callback`
- **Authorized JavaScript origins** → agrega:
  - `https://TU-WEB.vercel.app`

Sin esto, el login con Google y la conexión de YouTube fallan en producción.

---

## 5. Probar

1. Entra a `https://TU-WEB.vercel.app`.
2. Login con Google (tu correo queda **SUPER_ADMIN** por la allowlist; los demás entran como **DJ**).
3. Verifica que el catálogo cargó (módulo Música y DJs).

---

## Notas

- **Redeploys**: el código se actualiza solo desde git. La DB persiste. Solo vuelve
  a correr `db:push` si cambiaste el `schema.prisma`, y `db:seed` si quieres
  refrescar el catálogo (es idempotente).
- **Migraciones formales**: para un prod "de verdad" conviene pasar de `db:push` a
  migraciones de Prisma (`prisma migrate`). Para el sitio de pruebas, `db:push` basta.
