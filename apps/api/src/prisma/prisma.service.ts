import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/** URL por defecto para dev local (ver docker-compose.yml). En prod va por env. */
const DEFAULT_DB_URL = 'postgresql://baile:baile@localhost:5432/baile';

// Acentos → base (para el trigger de búsqueda, sin depender de la extensión unaccent).
const ACC_FROM = 'áàäâãéèëêíìïîóòöôõúùüûñç';
const ACC_TO = 'aaaaaeeeeiiiiooooouuuunc';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    // Prisma 7: el cliente se conecta mediante un driver adapter (PostgreSQL).
    super({
      adapter: new PrismaPg(process.env.DATABASE_URL ?? DEFAULT_DB_URL),
    });
  }

  async onModuleInit() {
    await this.$connect();
    await this.ensureSearchText().catch((e) =>
      this.logger.warn(
        `No se pudo preparar la búsqueda sin acentos: ${e instanceof Error ? e.message : e}`,
      ),
    );
  }

  /**
   * Mantiene `Track.searchText` (título+artista sin acentos, minúsculas) con un
   * trigger, para búsqueda insensible a acentos. Idempotente; se salta si la
   * columna aún no existe (falta `db:push`). No usa la extensión unaccent.
   */
  private async ensureSearchText() {
    const col = await this.$queryRawUnsafe<unknown[]>(
      `SELECT 1 FROM information_schema.columns WHERE table_name = 'Track' AND column_name = 'searchText' LIMIT 1`,
    );
    if (!Array.isArray(col) || col.length === 0) return; // falta db:push

    const expr = `translate(lower(coalesce(NEW.title,'') || ' ' || coalesce(NEW.artist,'')), '${ACC_FROM}', '${ACC_TO}')`;
    await this.$executeRawUnsafe(
      `CREATE OR REPLACE FUNCTION track_search_text() RETURNS trigger AS $fn$ BEGIN NEW."searchText" := ${expr}; RETURN NEW; END; $fn$ LANGUAGE plpgsql;`,
    );
    await this.$executeRawUnsafe(
      `DROP TRIGGER IF EXISTS track_search_text_trg ON "Track";`,
    );
    await this.$executeRawUnsafe(
      `CREATE TRIGGER track_search_text_trg BEFORE INSERT OR UPDATE ON "Track" FOR EACH ROW EXECUTE FUNCTION track_search_text();`,
    );
    // Rellena las existentes (solo las que aún no tienen searchText).
    await this.$executeRawUnsafe(
      `UPDATE "Track" SET "searchText" = translate(lower(coalesce(title,'') || ' ' || coalesce(artist,'')), '${ACC_FROM}', '${ACC_TO}') WHERE "searchText" IS NULL;`,
    );
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
