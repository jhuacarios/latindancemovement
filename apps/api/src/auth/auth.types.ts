import type { UserRole } from '@baile-latino/types';

/** Forma de `request.user` tras pasar por JwtAuthGuard. */
export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}
