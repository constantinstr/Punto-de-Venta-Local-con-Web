import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { withTenantContext, Prisma, UserRole } from '@pos/database';
import type { CreateUserDto } from './dto/create-user.dto';
import type { UpdateUserDto } from './dto/update-user.dto';
import type { AuthUser } from '../common/types/auth-user';
import { AuditService } from '../audit/audit.service';

const BCRYPT_ROUNDS = 12;

const SAFE_USER_SELECT = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  isActive: true,
  createdAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly auditService: AuditService) {}

  async create(tenantId: string, actor: AuthUser, dto: CreateUserDto) {
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    return withTenantContext(tenantId, async (tx) => {
      const user = await tx.user.create({
        data: {
          tenantId,
          email: dto.email,
          passwordHash,
          fullName: dto.fullName,
          role: dto.role,
        },
        select: SAFE_USER_SELECT,
      });

      await this.auditService.record(tx, tenantId, {
        userId: actor.userId,
        userEmail: actor.email,
        action: 'user.create',
        entityType: 'User',
        entityId: user.id,
        metadata: { email: user.email, role: user.role },
      });

      return user;
    });
  }

  findAll(tenantId: string) {
    return withTenantContext(tenantId, (tx) =>
      tx.user.findMany({
        where: { tenantId },
        select: SAFE_USER_SELECT,
        orderBy: { createdAt: 'asc' },
      }),
    );
  }

  // Hash calculado fuera de la transacción a propósito, igual que en
  // create() — bcrypt con 12 rounds es lo bastante lento como para no
  // convenir tenerlo adentro de una transacción interactiva.
  async update(
    tenantId: string,
    actor: AuthUser,
    id: string,
    dto: UpdateUserDto,
  ) {
    const passwordHash = dto.newPassword
      ? await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS)
      : undefined;

    return withTenantContext(tenantId, async (tx) => {
      const target = await tx.user.findFirst({ where: { id, tenantId } });
      if (!target) throw new NotFoundException('Usuario no encontrado');

      // El OWNER del tenant no se toca por este endpoint: ni su rol, ni su
      // estado activo, ni nada — evita un lockout total del tenant.
      if (target.role === UserRole.OWNER) {
        throw new ForbiddenException(
          'El usuario OWNER no se puede modificar desde acá',
        );
      }

      // Nadie puede tocar su propio rol ni desactivarse — evita quedar
      // bloqueado por accidente (o degradarse a sí mismo).
      if (
        id === actor.userId &&
        (dto.role !== undefined || dto.isActive === false)
      ) {
        throw new ForbiddenException(
          'No podés cambiar tu propio rol ni desactivar tu propia cuenta',
        );
      }

      // Un ADMIN nunca edita a otro ADMIN (ni lo asciende a ADMIN) — solo
      // el OWNER tiene ese permiso.
      if (
        actor.role !== UserRole.OWNER &&
        (target.role === UserRole.ADMIN || dto.role === UserRole.ADMIN)
      ) {
        throw new ForbiddenException(
          'Solo el OWNER puede modificar o asignar el rol ADMIN',
        );
      }

      const data: Prisma.UserUpdateInput = {};
      if (dto.fullName !== undefined) data.fullName = dto.fullName;
      if (dto.role !== undefined) data.role = dto.role;
      if (dto.isActive !== undefined) data.isActive = dto.isActive;
      if (passwordHash) data.passwordHash = passwordHash;

      const user = await tx.user.update({
        where: { id },
        data,
        select: SAFE_USER_SELECT,
      });

      await this.auditService.record(tx, tenantId, {
        userId: actor.userId,
        userEmail: actor.email,
        action: 'user.update',
        entityType: 'User',
        entityId: id,
        metadata: {
          fullName: dto.fullName,
          role: dto.role,
          isActive: dto.isActive,
          passwordReset: Boolean(passwordHash),
        },
      });

      return user;
    });
  }
}
