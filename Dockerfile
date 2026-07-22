# API (NestJS) para Railway. Node 22 fijo (evita el bug de Node 24 con prisma.config.ts).
FROM node:22-slim

# OpenSSL/ca-certs por si Prisma los necesita; corepack para pnpm.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable

WORKDIR /app

# Copia todo el monorepo (el contexto ya excluye node_modules/.env vía .dockerignore).
COPY . .

# Instala dependencias (postinstall corre prisma generate, ahora en Node 22).
RUN pnpm install --frozen-lockfile

# Build de la API + sus deps (turbo encadena @baile-latino/types).
RUN pnpm exec turbo run build --filter=@baile-latino/api

ENV NODE_ENV=production

# Al arrancar: sincroniza el schema con la base y recién ahí levanta la API. El
# proyecto usa `db push` (no hay carpeta de migraciones), así que sin esto un
# campo nuevo del schema no existiría en la DB de producción.
#
# A propósito SIN --accept-data-loss: si un cambio implicara perder datos, el
# arranque falla y Railway lo marca en rojo, en vez de borrarlos en silencio.
CMD ["sh", "-c", ": \"${DATABASE_URL:?falta DATABASE_URL}\" && pnpm --filter @baile-latino/api exec prisma db push && node apps/api/dist/main.js"]
