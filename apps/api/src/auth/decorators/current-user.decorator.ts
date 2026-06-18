import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthUser } from '../auth.types';

/** Inyecta el usuario autenticado (request.user) en un parámetro del handler. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user as AuthUser;
  },
);
