import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@pos/database';

export const ROLES_KEY = 'roles';

// Lista explícita de roles permitidos por endpoint (no un umbral numérico):
// ver docs/ARCHITECTURE.md §4 sobre por qué se decidió así.
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
