import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { ASSIGNABLE_ROLES, type AssignableRole } from './create-user.dto';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  fullName?: string;

  // OWNER queda afuera del enum asignable — ver create-user.dto.ts.
  @IsOptional()
  @IsEnum(ASSIGNABLE_ROLES)
  role?: AssignableRole;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(8)
  newPassword?: string;
}
