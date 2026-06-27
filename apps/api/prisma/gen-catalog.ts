import 'dotenv/config';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * Regenera prisma/catalog.seed.json desde la base apuntada por DATABASE_URL
 * (por defecto, tu Postgres local). Sirve para luego sincronizar el catálogo a
 * producción con `pnpm db:seed` (apuntando DATABASE_URL al Postgres de prod).
 *
 * Uso (desde apps/api):  pnpm db:gen-catalog
 */
const prisma = new PrismaClient({
  adapter: new PrismaPg(
    process.env.DATABASE_URL ?? 'postgresql://baile:baile@localhost:5432/baile',
  ),
});

async function main() {
  const tracks = await prisma.track.findMany({
    where: { scope: 'CATALOG' },
    orderBy: [{ style: 'asc' }, { artist: 'asc' }, { title: 'asc' }],
  });
  const out = tracks.map((t) => ({
    title: t.title,
    artist: t.artist,
    style: t.style,
    substyle: t.substyle,
    year: t.year,
    source: t.source,
    sourceId: t.sourceId,
    coverUrl: t.coverUrl,
    durationSec: t.durationSec,
    isRelease: t.isRelease,
    approvalStatus: t.approvalStatus,
    ytMetadata: t.ytMetadata,
  }));
  const path = join(__dirname, 'catalog.seed.json');
  writeFileSync(path, JSON.stringify(out, null, 2));
  const withSub = out.filter((t) => t.substyle).length;
  console.log(
    `catalog.seed.json regenerado: ${out.length} canciones (${withSub} con sub-estilo).`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
