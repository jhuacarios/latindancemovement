/**
 * Sincroniza correcciones del CATÁLOGO desde la base LOCAL (fuente de verdad,
 * mientras se prepara el lanzamiento) hacia PRODUCCIÓN, bajo demanda.
 *
 * Seguro por diseño:
 *  - Solo toca canciones de catálogo (scope='CATALOG').
 *  - Empareja por (source, sourceId) — el id de YouTube/Spotify, estable entre bases.
 *  - Solo ACTUALIZA lo que difiere. NO borra. NO inserta canciones nuevas
 *    (las que están en local y no en prod se listan como aviso, no se crean:
 *    insertar requiere mapear el dueño/creador y se decide aparte).
 *  - DRY-RUN por defecto: muestra qué cambiaría. Recién con `--apply` escribe.
 *  - Las escrituras en prod van en una transacción (todo o nada).
 *
 * Uso (desde apps/api):
 *   PROD_DATABASE_URL="postgres://...prod..." node scripts/sync-catalog-to-prod.mjs          # dry-run
 *   PROD_DATABASE_URL="postgres://...prod..." node scripts/sync-catalog-to-prod.mjs --apply   # aplica
 *
 * LOCAL toma DATABASE_URL (o LOCAL_DATABASE_URL); prod toma PROD_DATABASE_URL.
 * El secreto de prod vive en tu entorno, no en el código.
 */
import pg from 'pg';

const LOCAL_URL =
  process.env.LOCAL_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgresql://baile:baile@localhost:5432/baile';
const PROD_URL = process.env.PROD_DATABASE_URL;
const APPLY = process.argv.includes('--apply');

if (!PROD_URL) {
  console.error('❌ Falta PROD_DATABASE_URL en el entorno.');
  process.exit(1);
}
if (LOCAL_URL === PROD_URL) {
  console.error('❌ LOCAL y PROD apuntan a la misma base. Abortando.');
  process.exit(1);
}

// Campos de metadata que se comparan y copian (searchText se recalcula aparte).
const FIELDS = [
  'title',
  'artist',
  'style',
  'substyle',
  'year',
  'releaseDate',
  'coverUrl',
  'durationSec',
  'viewCount',
  'popularity',
  'spotifyPlayable',
  'isRelease',
  'approvalStatus',
  'ytMetadata',
];

/** Igual que el trigger/search.util: minúsculas sin acentos (para searchText). */
function normSearch(s) {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** Comparación laxa: null/undefined ~ '', BigInt/number/bool → string. */
function eq(a, b) {
  return String(a ?? '') === String(b ?? '');
}

const cols = FIELDS.map((f) => `"${f}"`).join(', ');
const selectSql = `SELECT source, "sourceId", ${cols} FROM "Track" WHERE scope='CATALOG'`;

const local = new pg.Client({ connectionString: LOCAL_URL });
const prod = new pg.Client({ connectionString: PROD_URL });
await local.connect();
await prod.connect();

try {
  const lrows = (await local.query(selectSql)).rows;
  const prows = (await prod.query(selectSql)).rows;
  const pmap = new Map(prows.map((r) => [`${r.source}|${r.sourceId}`, r]));

  const toUpdate = [];
  const missingInProd = [];
  for (const l of lrows) {
    const p = pmap.get(`${l.source}|${l.sourceId}`);
    if (!p) {
      missingInProd.push(l);
      continue;
    }
    const diffs = FIELDS.filter((f) => !eq(p[f], l[f]));
    if (diffs.length) toUpdate.push({ l, diffs });
  }

  console.log(`\nLocal (catálogo):  ${lrows.length}`);
  console.log(`Prod  (catálogo):  ${prows.length}`);
  console.log(`A actualizar (difieren):  ${toUpdate.length}`);
  console.log(`En local pero NO en prod (no se insertan): ${missingInProd.length}\n`);

  for (const { l, diffs } of toUpdate) {
    console.log(
      `  ~ ${l.source}:${l.sourceId}  [${diffs.join(', ')}]  →  "${l.title}" / "${l.artist}"`,
    );
  }
  if (missingInProd.length) {
    console.log('\n  (solo-local, se omiten):');
    for (const l of missingInProd.slice(0, 30)) {
      console.log(`    + ${l.source}:${l.sourceId}  "${l.title}" / "${l.artist}"`);
    }
    if (missingInProd.length > 30) console.log(`    …y ${missingInProd.length - 30} más`);
  }

  if (!APPLY) {
    console.log('\n🟡 DRY-RUN: no se escribió nada. Volvé a correr con --apply para aplicar.');
    process.exit(0);
  }

  if (toUpdate.length === 0) {
    console.log('\n✅ Nada que actualizar. Prod ya está al día.');
    process.exit(0);
  }

  const setSql = FIELDS.map((f, i) => `"${f}" = $${i + 1}`).join(', ');
  const searchIdx = FIELDS.length + 1;
  const srcIdx = FIELDS.length + 2;
  const sidIdx = FIELDS.length + 3;
  const updateSql =
    `UPDATE "Track" SET ${setSql}, "searchText" = $${searchIdx}, "updatedAt" = now() ` +
    `WHERE source = $${srcIdx} AND "sourceId" = $${sidIdx} AND scope='CATALOG'`;

  await prod.query('BEGIN');
  try {
    for (const { l } of toUpdate) {
      const searchText = normSearch(`${l.title} ${l.artist}`);
      const values = [...FIELDS.map((f) => l[f]), searchText, l.source, l.sourceId];
      await prod.query(updateSql, values);
    }
    await prod.query('COMMIT');
  } catch (e) {
    await prod.query('ROLLBACK');
    throw e;
  }

  console.log(`\n✅ Aplicadas ${toUpdate.length} actualizaciones en PROD.`);
} finally {
  await local.end();
  await prod.end();
}
