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

// Tope efectivo cuando el comercio no configuró nada.
//
// Vive en código y no como filas sembradas en la base a propósito: así vale
// para TODOS los comercios —los que ya existían y los que se den de alta
// mañana— sin migración de datos ni lógica de alta duplicada. Una fila en
// DiscountPolicy pasa a significar "este comercio decidió otra cosa".
//
// El cajero arranca en 0: es el rol al que se le pide autorización para
// descontar en cualquier comercio, y el descuento de mostrador no autorizado
// es el desvío de caja más común. El encargado puede resolver el caso normal
// (10%) sin llamar a nadie. 100 es "sin tope" efectivo: el descuento nunca
// puede superar el bruto de la línea, así que no hay nada más allá.
export const NO_LIMIT = 100;

export const DEFAULT_DISCOUNT_LIMITS: Record<string, number> = {
  [UserRole.CASHIER]: 0,
  [UserRole.MANAGER]: 10,
  [UserRole.ADMIN]: NO_LIMIT,
  [UserRole.OWNER]: NO_LIMIT,
};

export interface EffectiveDiscountPolicy {
  role: UserRole;
  maxPercent: number;
  /** true = viene del valor por defecto, no de una decisión del comercio. */
  isDefault: boolean;
}

@Injectable()
export class DiscountPolicyService {
  // Devuelve SIEMPRE los cuatro roles con su tope efectivo, no solo los que
  // tienen fila. Que la pantalla tenga que saber cuál es el default para
  // rellenar los huecos sería duplicar la regla en los dos lados.
  async findAll(tenantId: string): Promise<EffectiveDiscountPolicy[]> {
    const rows = await withTenantContext(tenantId, (tx) =>
      tx.discountPolicy.findMany({ where: { tenantId } }),
    );
    const byRole = new Map(rows.map((r) => [r.role, Number(r.maxPercent)]));

    return SELLING_ROLES.map((role) => {
      const configured = byRole.get(role);
      return {
        role,
        maxPercent: configured ?? DEFAULT_DISCOUNT_LIMITS[role] ?? NO_LIMIT,
        isDefault: configured === undefined,
      };
    });
  }

  // Upsert por rol: la pantalla manda "este rol tiene tope X". Mandar
  // maxPercent = null BORRA la fila, o sea vuelve al valor por defecto —
  // no significa "sin tope". Para dejar un rol sin tope se manda 100.
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

  // Tope efectivo del rol: lo que configuró el comercio, o el valor por
  // defecto. Devuelve null solo para roles que no venden (SUPERADMIN), donde
  // no hay nada que limitar.
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
    if (policy) return Number(policy.maxPercent);
    return DEFAULT_DISCOUNT_LIMITS[role] ?? null;
  }
}
