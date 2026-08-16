import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { withTenantContext } from '@pos/database';
import type { CreateUserDto } from './dto/create-user.dto';

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
  async create(tenantId: string, dto: CreateUserDto) {
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    return withTenantContext(tenantId, (tx) =>
      tx.user.create({
        data: {
          tenantId,
          email: dto.email,
          passwordHash,
          fullName: dto.fullName,
          role: dto.role,
        },
        select: SAFE_USER_SELECT,
      }),
    );
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
}
