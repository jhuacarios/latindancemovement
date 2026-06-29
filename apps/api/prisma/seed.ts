import 'dotenv/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({
  adapter: new PrismaPg(
    process.env.DATABASE_URL ?? 'postgresql://baile:baile@localhost:5432/baile',
  ),
});

interface SeedTrack {
  title: string;
  artist: string;
  style: string;
  substyle: string | null;
  year: number | null;
  source: string;
  sourceId: string;
  coverUrl: string | null;
  durationSec: number | null;
  isRelease: boolean;
  approvalStatus: string;
  ytMetadata: string | null;
}

/** Reproducciones (BigInt) desde el JSON de metadata, o null. */
const viewsFromMeta = (json: string | null): bigint | null => {
  if (!json) return null;
  try {
    const v = (JSON.parse(json) as { viewCount?: unknown })?.viewCount;
    const s = String(v ?? '').trim();
    return /^\d+$/.test(s) ? BigInt(s) : null;
  } catch {
    return null;
  }
};

const slugify = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

async function main() {
  // Dueño del catálogo: el super admin (por email). Al entrar con Google con ese
  // correo, la cuenta se vincula por email y toma control. Configura
  // SUPER_ADMIN_EMAILS antes de sembrar para que el catálogo quede a tu nombre.
  const ownerEmail =
    (process.env.SUPER_ADMIN_EMAILS ?? '').split(',')[0].trim().toLowerCase() ||
    'admin@bailelatino.cl';
  const owner = await prisma.user.upsert({
    where: { email: ownerEmail },
    update: {},
    create: {
      email: ownerEmail,
      name: 'Administrador',
      role: 'SUPER_ADMIN',
      emailVerified: true,
      styles: 'BACHATA,SALSA',
    },
  });

  // Vocabulario de sub-estilos (tags) por estilo. El mismo nombre puede existir
  // en ambos estilos (ej: Clásica, Lenta, Romántica) -> único compuesto [slug, style].
  const tags: { name: string; style: 'BACHATA' | 'SALSA' }[] = [
    { name: 'Bachatón', style: 'BACHATA' },
    { name: 'Clásica', style: 'BACHATA' },
    { name: 'Dominicana', style: 'BACHATA' },
    { name: 'Lenta', style: 'BACHATA' },
    { name: 'Moderna', style: 'BACHATA' },
    { name: 'Movida', style: 'BACHATA' },
    { name: 'Remix', style: 'BACHATA' },
    { name: 'Romántica', style: 'BACHATA' },
    { name: 'Sensual', style: 'BACHATA' },
    { name: 'Tradicional', style: 'BACHATA' },
    { name: 'Urbana', style: 'BACHATA' },
    { name: 'Caleña', style: 'SALSA' },
    { name: 'Cha Cha', style: 'SALSA' },
    { name: 'Clásica', style: 'SALSA' },
    { name: 'Cubana', style: 'SALSA' },
    { name: 'Dura', style: 'SALSA' },
    { name: 'En línea', style: 'SALSA' },
    { name: 'Guaracha', style: 'SALSA' },
    { name: 'Lenta', style: 'SALSA' },
    { name: 'Mambo', style: 'SALSA' },
    { name: 'Pachanga', style: 'SALSA' },
    { name: 'Romántica', style: 'SALSA' },
    { name: 'Rueda de casino', style: 'SALSA' },
    { name: 'Son', style: 'SALSA' },
    { name: 'Timba', style: 'SALSA' },
  ];
  for (const tag of tags) {
    const slug = slugify(tag.name);
    await prisma.tag.upsert({
      where: { slug_style: { slug, style: tag.style } },
      update: { name: tag.name },
      create: { name: tag.name, slug, style: tag.style, createdById: owner.id },
    });
  }

  // Catálogo actual (solo scope CATALOG), con toda su info (sub-estilos,
  // duraciones, ytMetadata/descripciones, etc.). NO incluye "Mis Canciones".
  const catalog: SeedTrack[] = JSON.parse(
    readFileSync(join(__dirname, 'catalog.seed.json'), 'utf8'),
  );
  let created = 0;
  let updated = 0;
  for (const t of catalog) {
    const data = {
      title: t.title,
      artist: t.artist,
      style: t.style,
      substyle: t.substyle,
      year: t.year,
      coverUrl: t.coverUrl,
      durationSec: t.durationSec,
      isRelease: t.isRelease,
      approvalStatus: t.approvalStatus,
      ytMetadata: t.ytMetadata,
      viewCount: viewsFromMeta(t.ytMetadata),
    };
    const existing = await prisma.track.findFirst({
      where: { source: t.source, sourceId: t.sourceId, scope: 'CATALOG' },
      select: { id: true },
    });
    if (existing) {
      await prisma.track.update({ where: { id: existing.id }, data });
      updated++;
    } else {
      await prisma.track.create({
        data: {
          ...data,
          source: t.source,
          sourceId: t.sourceId,
          scope: 'CATALOG',
          createdById: owner.id,
        },
      });
      created++;
    }
  }

  console.log(
    `Seed OK. Dueño: ${owner.email}. Sub-estilos: ${tags.length}. ` +
      `Catálogo: +${created} nuevas / ${updated} actualizadas (total ${catalog.length}).`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
