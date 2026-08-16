import type { UserRole } from '@pos/database';

// Forma del `req.user` que deja la JwtStrategy tras validar el access token.
export interface AuthUser {
  userId: string;
  tenantId: string | null;
  role: UserRole;
  email: string;
}
