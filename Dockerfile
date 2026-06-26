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
CMD ["node", "apps/api/dist/main.js"]
