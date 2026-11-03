#!/usr/bin/env bash
# Actualiza producción con lo último de main. Correr EN EL SERVIDOR:
#   /opt/nectason/deploy/update.sh
set -euo pipefail
cd "$(dirname "$0")/.."

git pull --ff-only

# Proxy HTTPS compartido del servidor (crea la red `web`). Si ya está arriba, no hace nada.
docker compose -f deploy/proxy/docker-compose.yml up -d

docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env up -d --build
docker image prune -f >/dev/null

# La API corre `prisma db push` al arrancar; esperar a que responda.
for i in $(seq 1 60); do
  if docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env exec -T api \
    node -e "fetch('http://localhost:3000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
    echo "API arriba."
    exit 0
  fi
  sleep 2
done
echo "La API no respondió. Revisa: docker compose -f deploy/docker-compose.prod.yml logs api" >&2
exit 1
