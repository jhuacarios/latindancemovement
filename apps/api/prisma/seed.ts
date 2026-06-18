import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient({
  adapter: new PrismaLibSql({
    url: process.env.DATABASE_URL ?? 'file:./prisma/dev.db',
  }),
});

async function main() {
  const passwordHash = await bcrypt.hash('password123', 10);

  const dj = await prisma.user.upsert({
    where: { email: 'dj@bailelatino.cl' },
    update: {},
    create: {
      email: 'dj@bailelatino.cl',
      passwordHash,
      name: 'DJ Demo',
      role: 'DJ',
      city: 'Viña del Mar',
      styles: 'BACHATA,SALSA',
    },
  });

  const sample = [
    { title: 'Propuesta Indecente', artist: 'Romeo Santos', style: 'BACHATA', substyle: 'BACHATA_SENSUAL', bpm: 130, year: 2013, source: 'YOUTUBE', sourceId: 'e_Vym6fEPdo' },
    { title: 'Obsesión', artist: 'Aventura', style: 'BACHATA', substyle: 'BACHATA_TRADICIONAL', bpm: 125, year: 2002, source: 'YOUTUBE', sourceId: 'kv7yK-PgZ7w' },
    { title: 'Vivir Mi Vida', artist: 'Marc Anthony', style: 'SALSA', substyle: 'SALSA_ON1', bpm: 95, year: 2013, source: 'YOUTUBE', sourceId: 'YXnjy5YlDwk' },
    { title: 'La Vida Es Un Carnaval', artist: 'Celia Cruz', style: 'SALSA', substyle: 'SALSA_CUBANA', bpm: 100, year: 1998, source: 'YOUTUBE', sourceId: 'CMPdAVS_DfA' },
    { title: 'Eres Mía', artist: 'Romeo Santos', style: 'BACHATA', substyle: 'BACHATA_SENSUAL', bpm: 128, year: 2014, source: 'YOUTUBE', sourceId: 'NHkHQHGSdGw' },
    { title: 'Idilio', artist: 'Willie Colón', style: 'SALSA', substyle: 'SALSA_ON2', bpm: 92, year: 1979, source: 'YOUTUBE', sourceId: 'D5w7e4D9NkM' },
  ] as const;

  for (const t of sample) {
    await prisma.track.upsert({
      where: { source_sourceId: { source: t.source, sourceId: t.sourceId } },
      update: {},
      create: { ...t, createdById: dj.id, approvalStatus: 'APROBADA' },
    });
  }

  console.log(`Seed OK. DJ: ${dj.email} / password123. Tracks: ${sample.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
