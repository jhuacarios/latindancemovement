/**
 * Compara el CATÁLOGO entre LOCAL y PROD — SOLO LECTURA (no escribe nada).
 * Empareja por (source, sourceId) y reporta:
 *  - cuántas hay en cada lado,
 *  - las que están en LOCAL y NO en PROD,
 *  - las que están en PROD y NO en LOCAL.
 *
 * Uso (desde apps/api):
 *   PROD_DATABASE_URL="postgres://...prod..." node scripts/compare-catalog.mjs
 *
 * LOCAL toma DATABASE_URL (o LOCAL_DATABASE_URL); prod toma PROD_DATABASE_URL.
 */
import pg from 'pg';

const LOCAL_URL =
  process.env.LOCAL_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgresql://baile:baile@localhost:5432/baile';
const PROD_URL = process.env.PROD_DATABASE_URL;

if (!PROD_URL) {
  console.error('❌ Falta PROD_DATABASE_URL en el entorno.');
  process.exit(1);
}

const SQL = `SELECT source, "sourceId", title, artist, style FROM "Track" WHERE scope='CATALOG'`;

const local = new pg.Client({ connectionString: LOCAL_URL });
const prod = new pg.Client({ connectionString: PROD_URL });
await local.connect();
await prod.connect();

try {
  const l = (await local.query(SQL)).rows;
  const p = (await prod.query(SQL)).rows;
  const key = (r) => `${r.source}|${r.sourceId}`;
  const lmap = new Map(l.map((r) => [key(r), r]));
  const pmap = new Map(p.map((r) => [key(r), r]));

  const onlyLocal = l.filter((r) => !pmap.has(key(r)));
  const onlyProd = p.filter((r) => !lmap.has(key(r)));
  const common = l.filter((r) => pmap.has(key(r)));

  console.log(`\n=== Catálogo (scope=CATALOG) ===`);
  console.log(`Local:  ${l.length}`);
  console.log(`Prod:   ${p.length}`);
  console.log(`En común (por source+sourceId): ${common.length}`);
  console.log(`Solo en LOCAL (faltan en prod): ${onlyLocal.length}`);
  console.log(`Solo en PROD  (faltan en local): ${onlyProd.length}`);

  const show = (label, rows) => {
    if (!rows.length) return;
    console.log(`\n--- ${label} (${rows.length}) ---`);
    for (const r of rows) {
      console.log(`  [${r.source} ${r.style}] "${r.title}" / "${r.artist}"  (${r.sourceId})`);
    }
  };
  show('SOLO EN LOCAL', onlyLocal);
  show('SOLO EN PROD', onlyProd);
} finally {
  await local.end();
  await prod.end();
}
