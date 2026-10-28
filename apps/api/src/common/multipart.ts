import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { FastifyRequest } from 'fastify';

/** Formatos de imagen aceptados (también los que acepta la API de Anthropic). */
export const IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

/** Tamaño máximo de una imagen subida (límite de imagen de la API de Anthropic). */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export interface UploadedImage {
  buffer: Buffer;
  mime: string;
}

export interface ParsedMultipart {
  file: UploadedImage | null;
  fields: Record<string, string>;
}

/**
 * Lee un multipart con (opcionalmente) una imagen `file` y campos de texto.
 * Recorre las partes en orden, así no importa si el archivo viene antes o
 * después de los campos (con `req.file()` los campos posteriores se perdían).
 */
export async function readMultipart(req: FastifyRequest): Promise<ParsedMultipart> {
  if (!req.isMultipart()) {
    throw new BadRequestException('Se esperaba un formulario multipart.');
  }
  let file: ParsedMultipart['file'] = null;
  const fields: Record<string, string> = {};
  for await (const part of req.parts()) {
    if (part.type === 'file') {
      if (part.fieldname !== 'file') {
        await part.toBuffer(); // drenar para no bloquear el stream
        continue;
      }
      if (!IMAGE_MIME_TYPES.has(part.mimetype)) {
        throw new BadRequestException(
          'Formato de imagen no permitido. Usa JPG, PNG o WEBP.',
        );
      }
      const buffer = await part.toBuffer();
      if (buffer.length > MAX_IMAGE_BYTES) {
        throw new BadRequestException('La imagen no puede superar 5 MB.');
      }
      file = { buffer, mime: part.mimetype };
    } else {
      fields[part.fieldname] = String(part.value ?? '');
    }
  }
  return { file, fields };
}

/**
 * Valida un JSON (que llegó como campo de texto del multipart) contra un DTO,
 * con las mismas reglas que el ValidationPipe global.
 */
export async function validateJsonField<T extends object>(
  cls: new () => T,
  raw: string | undefined,
): Promise<T> {
  if (!raw) throw new BadRequestException('Falta el campo "data" con el evento.');
  let plain: unknown;
  try {
    plain = JSON.parse(raw);
  } catch {
    throw new BadRequestException('El campo "data" no es JSON válido.');
  }
  const dto = plainToInstance(cls, plain, { enableImplicitConversion: true });
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  if (errors.length) {
    const messages = errors.flatMap((e) =>
      Object.values(e.constraints ?? {}),
    );
    throw new BadRequestException(messages);
  }
  return dto;
}
