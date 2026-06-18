import 'dotenv/config';
import path from 'node:path';
import { defineConfig, env } from 'prisma/config';

/**
 * Configuración de Prisma 7.
 * La URL de la base de datos para los comandos de Migrate/db push vive aquí
 * (ya no en schema.prisma). En runtime, el cliente usa el driver adapter
 * configurado en src/prisma/prisma.service.ts.
 */
export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  datasource: {
    url: env('DATABASE_URL'),
  },
});
