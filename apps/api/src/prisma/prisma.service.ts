import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    // Prisma 7: el cliente se conecta mediante un driver adapter.
    // SQLite (dev) vía libsql; para prod (PostgreSQL) se cambiaría por @prisma/adapter-pg.
    super({
      adapter: new PrismaLibSql({
        url: process.env.DATABASE_URL ?? 'file:./prisma/dev.db',
      }),
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
