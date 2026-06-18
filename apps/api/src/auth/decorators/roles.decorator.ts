import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@baile-latino/types';

export const ROLES_KEY = 'roles';

/** Restringe una ruta a los roles indicados. Úsalo junto a RolesGuard. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
