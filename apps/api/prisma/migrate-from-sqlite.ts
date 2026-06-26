import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * Migración puntual SQLite (dev.db) -> PostgreSQL. Copia TODOS los datos del
 * dev.db local (catálogo, biblioteca, playlists, settings/token de YouTube, etc.)
 * a la base Postgres apuntada por DATABASE_URL.
 *
 * Uso (con Postgres ya levantado y tablas creadas):
 *   docker compose up -d db
 *   cd apps/api
 *   pnpm db:push                 # crea el esquema vacío en Postgres
 *   pnpm db:migrate-sqlite        # copia los datos desde prisma/dev.db
 *
 * Es idempotente (skipDuplicates): re-correrlo no duplica.
 */

// node:sqlite es experimental; se carga por require para no depender de tipos.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite');

const prisma = new PrismaClient({
  adapter: new PrismaPg(
    process.env.DATABASE_URL ?? 'postgresql://baile:baile@localhost:5432/baile',
  ),
});

// Orden seguro de FKs: padres antes que hijos.
const ORDER: { table: string; delegate: string }[] = [
  { table: 'User', delegate: 'user' },
  { table: 'Tag', delegate: 'tag' },
  { table: 'Track', delegate: 'track' },
  { table: 'Setting', delegate: 'setting' },
  { table: 'Playlist', delegate: 'playlist' },
  { table: 'PlaylistItem', delegate: 'playlistItem' },
  { table: 'UserTrack', delegate: 'userTrack' },
  { table: 'TrackTag', delegate: 'trackTag' },
  { table: 'SongRequest', delegate: 'songRequest' },
  { table: 'RequestVote', delegate: 'requestVote' },
];

function coerce(value: unknown, type: string): unknown {
  if (value === null || value === undefined) return null;
  const t = type.toUpperCase();
  if (t === 'DATETIME') return new Date(value as string | number);
  if (t === 'BOOLEAN') return value === 1 || value === true || value === '1';
  return value;
}

async function main() {
  const dbPath = process.env.SQLITE_PATH ?? 'prisma/dev.db';
  const db = new DatabaseSync(dbPath);

  let total = 0;
  for (const { table, delegate } of ORDER) {
    const cols: { name: string; type: string }[] = db
      .prepare(`pragma table_info(${table})`)
      .all();
    if (cols.length === 0) {
      console.log(`- ${table}: (no existe en el SQLite, omitido)`);
      continue;
    }
    const rows: Record<string, unknown>[] = db
      .prepare(`select * from ${table}`)
      .all();
    if (rows.length === 0) {
      console.log(`- ${table}: 0 filas`);
      continue;
    }
    const typeByCol = new Map(cols.map((c) => [c.name, c.type]));
    const data = rows.map((r) => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(r)) {
        out[k] = coerce(v, typeByCol.get(k) ?? 'TEXT');
      }
      return out;
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await (prisma as any)[delegate].createMany({
      data,
      skipDuplicates: true,
    });
    total += res.count;
    console.log(`- ${table}: ${res.count}/${rows.length} insertadas`);
  }

  console.log(`\nMigración OK. Total insertadas: ${total}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
