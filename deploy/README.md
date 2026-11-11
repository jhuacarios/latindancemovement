# Deploy en servidor propio (Hetzner)

La **web** sigue en Vercel (auto-deploy en cada push a `main`). En el servidor corre
todo lo demás con Docker Compose:

| Servicio | Qué es |
|---|---|
| `api` | NestJS (el `Dockerfile` de la raíz). Al arrancar corre `prisma db push` |
| `analyzer` | Analizador de audio del Estudio (`apps/analyzer`), solo red interna |
| `db` | PostgreSQL 16 (volumen `pgdata`) |
| `redis` | Colas de BullMQ |

El HTTPS lo pone un **proxy compartido** ([proxy/](proxy/)): un solo Caddy para
todos los proyectos del servidor (Nectason hoy; la tienda u otros después). Cada
proyecto corre en su propio stack, conectado a la red `web`, y el
[proxy/Caddyfile](proxy/Caddyfile) decide qué dominio va a cuál. Para sumar un
proyecto: conectarlo a `web` con un alias, agregar su bloque al Caddyfile y
recargar Caddy (ver los comentarios en [proxy/docker-compose.yml](proxy/docker-compose.yml)).

El audio del Estudio y la galería van a **Cloudflare R2**, no al disco del servidor.

## Primera instalación

Servidor: Ubuntu 24.04, puertos 22/80/443 abiertos (hoy: Hetzner CPX22 en Helsinki, `135.181.200.203`).

```bash
# 1. Docker + 4 GB de swap (Demucs llega a ~2,5 GB de RAM al separar instrumentos)
curl -fsSL https://get.docker.com | sh
fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo "/swapfile none swap sw 0 0" >> /etc/fstab

# 2. Código (el repo es público: se clona por HTTPS, sin llaves)
git clone https://github.com/jhuacarios/latindancemovement.git /opt/nectason

# 3. Variables (completar; valores aleatorios con: openssl rand -hex 32)
cp /opt/nectason/deploy/.env.example /opt/nectason/deploy/.env
chmod 600 /opt/nectason/deploy/.env
nano /opt/nectason/deploy/.env

# 4. Levantar
/opt/nectason/deploy/update.sh

# 5. Respaldo diario de la base a R2 (04:00 UTC)
echo "0 4 * * * root /opt/nectason/deploy/backup-db.sh >> /var/log/nectason-backup.log 2>&1" > /etc/cron.d/nectason-backup
```

Guardar una copia de `deploy/.env` en el gestor de contraseñas: es lo único que no
se puede reconstruir desde el repo.

**DNS (Cloudflare):** `api.nectason.app` → registro **A** a la IP del servidor, en
modo **DNS only** (nube gris). Caddy necesita el puerto 80 libre y el DNS apuntando
para sacar el certificado.

## Actualizar

```bash
/opt/nectason/deploy/update.sh
```

## Útiles

```bash
cd /opt/nectason
C="docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env"
$C ps                     # estado
$C logs -f api            # logs de la API
$C exec db psql -U nectason nectason   # consola SQL
$C exec db pg_dump -U nectason nectason > backup.sql   # respaldo manual
```
