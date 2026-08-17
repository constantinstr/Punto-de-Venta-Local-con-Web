import { BadRequestException, Injectable } from '@nestjs/common';
import {
  withTenantContext,
  UserRole,
  type TransactionClient,
} from '@pos/database';
import type { SetDiscountPolicyDto } from './dto/set-discount-policy.dto';

// Los roles que pueden vender en el mostrador. SUPERADMIN queda afuera a
// propósito: es staff del SaaS, no opera la caja de nadie.
export const SELLING_ROLES: UserRole[] = [
  UserRole.OWNER,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.CASHIER,
];

@Injectable()
export class DiscountPolicyService {
  findAll(tenantId: string) {
    return withTenantContext(tenantId, (tx) =>
      tx.discountPolicy.findMany({
        where: { tenantId },
        orderBy: { role: 'asc' },
      }),
    );
  }

  // Upsert por rol: la pantalla manda "este rol tiene tope X". Mandar
  // maxPercent = null saca el tope (borra la fila), que es distinto de
  // ponerle 0 — 0 significa "no puede descontar nada".
  async set(tenantId: string, dto: SetDiscountPolicyDto) {
    if (!SELLING_ROLES.includes(dto.role)) {
      throw new BadRequestException(
        'Ese rol no vende en el mostrador, no tiene sentido darle un tope de descuento',
      );
    }

    return withTenantContext(tenantId, async (tx) => {
      const existing = await tx.discountPolicy.findFirst({
        where: { tenantId, role: dto.role },
      });

      if (dto.maxPercent === null || dto.maxPercent === undefined) {
        if (existing) {
          await tx.discountPolicy.delete({ where: { id: existing.id } });
        }
        return null;
      }

      if (existing) {
        return tx.discountPolicy.update({
          where: { id: existing.id },
          data: { maxPercent: dto.maxPercent },
        });
      }

      return tx.discountPolicy.create({
        data: { tenantId, role: dto.role, maxPercent: dto.maxPercent },
      });
    });
  }

  // Devuelve el tope del rol, o null si no tiene ninguno.
  //
  // Recibe la transacción del caller a propósito: lo usa OrdersService en
  // medio de armar una venta, y abrir una transacción aparte para leer una
  // fila sería gratuito solo en apariencia (el timeout de 5s de Prisma corre
  // para la transacción de la venta, no para esta).
  async findLimitFor(
    tx: TransactionClient,
    tenantId: string,
    role: UserRole,
  ): Promise<number | null> {
    const policy = await tx.discountPolicy.findFirst({
      where: { tenantId, role },
    });
    return policy ? Number(policy.maxPercent) : null;
  }
}
