import { ForbiddenException } from '@nestjs/common';
import type { AuthUser } from './types/auth-user';

// SUPERADMIN (staff del SaaS) no tiene tenantId; los endpoints de negocio
// scoped a un tenant deben usar esto para no operar sin uno.
export function requireTenant(user: AuthUser): string {
  if (!user.tenantId) {
    throw new ForbiddenException(
      'Esta acción requiere un usuario asociado a un tenant',
    );
  }
  return user.tenantId;
}
