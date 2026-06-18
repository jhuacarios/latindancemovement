import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

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

  const webUrl = process.env.WEB_URL ?? 'http://localhost:3001';
  app.enableCors({ origin: [webUrl], credentials: true });

  const port = Number(process.env.PORT ?? 3000);
  await app.listen({ port, host: '0.0.0.0' });

  Logger.log(`API arriba en http://localhost:${port}/api/v1`, 'Bootstrap');
}

void bootstrap();
