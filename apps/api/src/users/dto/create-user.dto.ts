import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';
import { UserRole } from '@pos/database';

// OWNER y SUPERADMIN quedan afuera a propósito: no se pueden crear por este
// endpoint (evita escalar privilegios creando otro dueño de tenant).
export const ASSIGNABLE_ROLES = [
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.CASHIER,
] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @MinLength(2)
  fullName!: string;

  @IsEnum(ASSIGNABLE_ROLES)
  role!: AssignableRole;
}
