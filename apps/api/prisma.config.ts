import 'dotenv/config';
import path from 'node:path';
import { defineConfig } from 'prisma/config';

/**
 * Configuración de Prisma 7.
 * La URL de la base de datos para los comandos de Migrate/db push vive aquí
 * (ya no en schema.prisma). En runtime, el cliente usa el driver adapter
 * configurado en src/prisma/prisma.service.ts.
 *
 * Usamos process.env con un fallback (en vez de env() estricto) para que
 * `prisma generate` funcione durante el build aunque DATABASE_URL no esté
 * seteada (generate no se conecta a la DB). En db push/migrate sí debe estar.
 */
export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  datasource: {
    url:
      process.env.DATABASE_URL ??
      'postgresql://baile:baile@localhost:5432/baile',
  },
});
