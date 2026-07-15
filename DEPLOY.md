# Deploy — Nectason

Stack del deploy: **Web → Vercel**, **API → Railway**, **DB → PostgreSQL** (Railway o Neon).

---

## Producción actual (Nectason)

| Pieza | URL / valor |
|-------|-------------|
| Web (Vercel) | `https://nectason.app` + `https://www.nectason.app` |
| API (Railway) | `https://api.nectason.app/api/v1` |
| Dominio + DNS | `nectason.app` registrado y gestionado en **Cloudflare** |

**DNS en Cloudflare** (todos en modo **DNS only / nube gris** — Vercel y Railway emiten su propio SSL):

| Tipo | Nombre | Contenido |
|------|--------|-----------|
| CNAME | `nectason.app` (apex) | target de Vercel (`*.vercel-dns-017.com`) |
| CNAME | `www` | target de Vercel |
| CNAME | `api` | target que muestra Railway al añadir el dominio |
| TXT | `_railway-verify.api` / `_vercel` | verificación (déjalos) |

> En Cloudflare la nube **gris** es obligatoria: si proxeas (naranja), Vercel/Railway
> no pueden validar su certificado.

`WEB_URL` admite **varias URLs separadas por coma**: la **primera** es a donde redirige
la API tras el login con Google/YouTube; **todas** se usan como orígenes permitidos en
CORS. Por eso el orden importa (la principal va primera).

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
   WEB_URL=https://nectason.app,https://www.nectason.app,https://latindancemovement.vercel.app
   GOOGLE_OAUTH_CLIENT_ID=<...>
   GOOGLE_OAUTH_CLIENT_SECRET=<...>
   GOOGLE_LOGIN_REDIRECT_URI=https://api.nectason.app/api/v1/auth/google/callback
   GOOGLE_OAUTH_REDIRECT_URI=https://api.nectason.app/api/v1/music/youtube/callback
   YOUTUBE_API_KEY=<si la usas>
   NODE_ENV=production
   ```
   > `WEB_URL` admite varias URLs separadas por coma. La **primera** es la de redirect
   > tras OAuth; las demás solo amplían los orígenes de CORS (previews de Vercel, www, etc.).
4. Tras el **primer deploy**, abre la shell del servicio (o usa `railway run`) y corre **una vez**:
   ```bash
   pnpm --filter @baile-latino/api db:push
   pnpm --filter @baile-latino/api db:seed
   ```
   Esto crea las tablas y carga el catálogo (a nombre del email de `SUPER_ADMIN_EMAILS`).
5. Anota la URL pública de la API (`https://api.nectason.app`, o la `*.up.railway.app` si aún no conectas el dominio).

---

## 3. Web en Vercel

1. New Project → importa este repo.
2. **Root Directory**: `apps/web`.
3. Framework: Next.js (autodetectado).
4. **Environment Variables**:
   ```
   NEXT_PUBLIC_API_URL=https://api.nectason.app/api/v1
   ```
   > Es **build-time**: si la cambias, hay que **Redeploy** del web para que tome efecto.
5. **Domains** (Settings → Domains): agrega `nectason.app` y `www.nectason.app`.
6. Deploy. La URL queda en `WEB_URL` de la API (ya incluida arriba).

---

## 4. Google Cloud Console (OAuth)

En tu cliente OAuth (login con Google + conexión de YouTube):

- **Authorized redirect URIs** → agrega:
  - `https://api.nectason.app/api/v1/auth/google/callback`
  - `https://api.nectason.app/api/v1/music/youtube/callback`
- **Authorized JavaScript origins** → agrega:
  - `https://nectason.app`
  - `https://www.nectason.app`

Sin esto, el login con Google y la conexión de YouTube fallan en producción.
Las redirect URIs deben ser **idénticas** a las envs `GOOGLE_*_REDIRECT_URI` de Railway.

---

## 4.1 Segmentación de entornos (YouTube / Google) — recomendado

**Por qué:** la cuota de la **API de YouTube** (10.000 unidades/día) es **por
proyecto de Google Cloud**. Si **dev y prod comparten** la misma `YOUTUBE_API_KEY`
/ cliente OAuth, probar en local **le quema la cuota a producción** (una búsqueda =
100 unidades) y comparten los límites de OAuth. La solución: **un proyecto de
Google Cloud por entorno**. El código ya es env-driven; solo cambian los valores
del `.env`.

**Crear el proyecto de DEV (una vez):**
1. [Google Cloud Console](https://console.cloud.google.com/) → **Crear proyecto**
   → nombre `nectason-dev`.
2. **APIs y servicios → Biblioteca** → habilita **YouTube Data API v3**.
3. **Credenciales → Crear credenciales → Clave de API** → cópiala a
   `YOUTUBE_API_KEY` del `.env` **local**.
4. **Credenciales → Crear credenciales → ID de cliente de OAuth** (tipo *Aplicación
   web*):
   - **Authorized redirect URIs**:
     - `http://localhost:3000/api/v1/auth/google/callback`
     - `http://localhost:3000/api/v1/music/youtube/callback`
   - **Authorized JavaScript origins**: `http://localhost:3001`
   - Copia el client id/secret a `GOOGLE_OAUTH_CLIENT_ID` /
     `GOOGLE_OAUTH_CLIENT_SECRET` del `.env` **local**.
5. **Pantalla de consentimiento de OAuth** (del proyecto dev) → en *Testing* →
   agrega tu correo (y el de quien pruebe) como **Usuarios de prueba**.

**Resultado:**
- **dev** (`apps/api/.env`) → credenciales de `nectason-dev` (redirects a localhost).
- **prod** (Railway) → las credenciales de producción **quedan solo en prod**.
- Probar en local ya **no afecta** la cuota ni el OAuth de producción.

> Mismo criterio aplica a **Spotify** (crear una app de Spotify aparte para dev) y
> es lo que evita que un rate-limit en local penalice producción.

---

## 5. Probar

1. Entra a `https://nectason.app`.
2. Login con Google (tu correo queda **SUPER_ADMIN** por la allowlist; los demás entran como **DJ**).
3. Verifica que el catálogo cargó (módulo Música y DJs).

---

## Notas

- **Redeploys**: el código se actualiza solo desde git. La DB persiste. Solo vuelve
  a correr `db:push` si cambiaste el `schema.prisma`, y `db:seed` si quieres
  refrescar el catálogo (es idempotente).
- **Migraciones formales**: para un prod "de verdad" conviene pasar de `db:push` a
  migraciones de Prisma (`prisma migrate`). Para el sitio de pruebas, `db:push` basta.
