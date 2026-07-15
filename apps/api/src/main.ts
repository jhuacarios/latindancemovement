import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ValidationPipe, Logger } from '@nestjs/common';
import fastifyMultipart from '@fastify/multipart';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  // Subida de archivos (import de Excel). Límite 10 MB.
  await app.register(fastifyMultipart, {
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  });

  // Prefijo global de la API (convención del proyecto).
  app.setGlobalPrefix('api/v1');

  // Validación + transformación automática de DTOs.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // WEB_URL admite varias URLs separadas por coma (ej: prod + previews de Vercel).
  const origins = (process.env.WEB_URL ?? 'http://localhost:3001')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: origins,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // Las respuestas del API nunca se cachean (evita listas desactualizadas).
  app
    .getHttpAdapter()
    .getInstance()
    .addHook('onSend', (_req, reply, _payload, done) => {
      reply.header('Cache-Control', 'no-store');
      done();
    });

  const port = Number(process.env.PORT ?? 3000);
  await app.listen({ port, host: '0.0.0.0' });

  Logger.log(`API arriba en http://localhost:${port}/api/v1`, 'Bootstrap');

  // Huella (enmascarada) de las credenciales de Google/YouTube activas, para
  // verificar de un vistazo que dev y prod usan proyectos DISTINTOS (la cuota de
  // YouTube es por proyecto). No expone secretos: solo primeros/últimos chars.
  const fp = (v?: string) =>
    v && v.length > 10 ? `${v.slice(0, 6)}…${v.slice(-4)}` : v || '(vacía)';
  Logger.log(
    `Entorno: NODE_ENV=${process.env.NODE_ENV ?? 'undefined'} · ` +
      `YouTube key ${fp(process.env.YOUTUBE_API_KEY)} · ` +
      `YouTube client ${fp(process.env.GOOGLE_OAUTH_CLIENT_ID)} · ` +
      `Login client ${fp(
        process.env.GOOGLE_LOGIN_CLIENT_ID ?? process.env.GOOGLE_OAUTH_CLIENT_ID,
      )}`,
    'Bootstrap',
  );
}

void bootstrap();
