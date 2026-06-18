import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@baile-latino/types';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { AuthUser } from '../auth.types';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Sin @Roles -> basta con estar autenticado.
    if (!required || required.length === 0) return true;

    const user = context.switchToHttp().getRequest().user as AuthUser | undefined;
    if (!user) throw new ForbiddenException('No autenticado');

    // SUPER_ADMIN siempre pasa.
    if (user.role === 'SUPER_ADMIN') return true;

    if (!required.includes(user.role)) {
      throw new ForbiddenException(
        `Requiere uno de los roles: ${required.join(', ')}`,
      );
    }
    return true;
  }
}
