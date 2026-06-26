import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/** URL por defecto para dev local (ver docker-compose.yml). En prod va por env. */
const DEFAULT_DB_URL = 'postgresql://baile:baile@localhost:5432/baile';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    // Prisma 7: el cliente se conecta mediante un driver adapter (PostgreSQL).
    super({
      adapter: new PrismaPg(process.env.DATABASE_URL ?? DEFAULT_DB_URL),
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
