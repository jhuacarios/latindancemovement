#!/usr/bin/env bash
# Respaldo diario de Postgres a Cloudflare R2 (fuera del servidor). Correr EN EL SERVIDOR;
# lo programa cron (ver deploy/README.md). Guarda BACKUP_KEEP_DAYS días.
#   Restaurar: bajar el .sql.gz y  gunzip -c archivo.sql.gz | docker compose ... exec -T db psql -U $POSTGRES_USER $POSTGRES_DB
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . deploy/.env; set +a

stamp=$(date -u +%Y-%m-%dT%H%M%SZ)
file="/tmp/nectason-db-$stamp.sql.gz"
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env exec -T db \
  pg_dump -U "$POSTGRES_USER" --no-owner "$POSTGRES_DB" | gzip -9 > "$file"

aws() {
  docker run --rm -v /tmp:/tmp \
    -e AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY_ID" -e AWS_SECRET_ACCESS_KEY="$S3_SECRET_ACCESS_KEY" \
    -e AWS_DEFAULT_REGION="${S3_REGION:-auto}" \
    amazon/aws-cli:2.27.0 --endpoint-url "$S3_ENDPOINT" "$@"
}

aws s3 cp "$file" "s3://$S3_BUCKET/backups/db/$(basename "$file")" --only-show-errors
rm -f "$file"

# Borra los respaldos más antiguos que BACKUP_KEEP_DAYS.
cutoff=$(date -u -d "-${BACKUP_KEEP_DAYS:-14} days" +%Y-%m-%d)
aws s3 ls "s3://$S3_BUCKET/backups/db/" | awk '{print $4}' | while read -r name; do
  day=$(echo "$name" | sed -E 's/^nectason-db-([0-9-]{10}).*/\1/')
  if [[ -n "$name" && "$day" < "$cutoff" ]]; then
    aws s3 rm "s3://$S3_BUCKET/backups/db/$name" --only-show-errors
  fi
done
echo "Respaldo subido: backups/db/$(basename "$file")"
