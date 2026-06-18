import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';

const prisma = new PrismaClient({
  adapter: new PrismaLibSql({
    url: process.env.DATABASE_URL ?? 'file:./prisma/dev.db',
  }),
});

/**
 * Backfill puntual: agrega todas las canciones de CATÁLOGO a la biblioteca
 * ("Mis Canciones") de los usuarios indicados, para no partir con la vista vacía.
 */
const EMAILS = ['jhuacarios@gmail.com', 'dj@bailelatino.cl'];

async function main() {
  const tracks = await prisma.track.findMany({
    where: { scope: 'CATALOG' },
    select: { id: true },
  });

  for (const email of EMAILS) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      console.log(`(omito) usuario no encontrado: ${email}`);
      continue;
    }
    let n = 0;
    for (const t of tracks) {
      await prisma.userTrack.upsert({
        where: { userId_trackId: { userId: user.id, trackId: t.id } },
        create: { userId: user.id, trackId: t.id },
        update: {},
      });
      n++;
    }
    console.log(`Backfill: ${n} canciones del catálogo -> ${email}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
