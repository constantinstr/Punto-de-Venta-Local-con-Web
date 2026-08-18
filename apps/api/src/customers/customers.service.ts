import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { withTenantContext } from '@pos/database';
import type { CreateCustomerDto } from './dto/create-customer.dto';
import type { UpdateCustomerDto } from './dto/update-customer.dto';
import type { FindCustomersQueryDto } from './dto/find-customers-query.dto';
import type { RegisterAccountPaymentDto } from './dto/register-account-payment.dto';
import type { RegisterAccountAdjustmentDto } from './dto/register-account-adjustment.dto';
import { applyAccountMovement } from './customer-account';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/types/auth-user';

@Injectable()
export class CustomersService {
  constructor(private readonly auditService: AuditService) {}

  findAll(tenantId: string, query: FindCustomersQueryDto) {
    return withTenantContext(tenantId, (tx) =>
      tx.customer.findMany({
        where: {
          tenantId,
          ...(query.q
            ? {
                OR: [
                  { name: { contains: query.q, mode: 'insensitive' } },
                  { lastName: { contains: query.q, mode: 'insensitive' } },
                  { businessName: { contains: query.q, mode: 'insensitive' } },
                  { docNumber: { contains: query.q } },
                  { whatsapp: { contains: query.q } },
                ],
              }
            : {}),
          ...(query.withDebt === 'true' ? { accountBalance: { gt: 0 } } : {}),
          ...(query.includeInactive === 'true' ? {} : { isActive: true }),
        },
        orderBy: { name: 'asc' },
        take: 50,
      }),
    );
  }

  create(tenantId: string, dto: CreateCustomerDto) {
    return withTenantContext(tenantId, (tx) =>
      tx.customer.create({ data: { tenantId, ...dto } }),
    );
  }

  async findOne(tenantId: string, id: string) {
    return withTenantContext(tenantId, async (tx) => {
      const customer = await tx.customer.findFirst({ where: { id, tenantId } });
      if (!customer) throw new NotFoundException('Cliente no encontrado');
      return customer;
    });
  }

  async update(tenantId: string, id: string, dto: UpdateCustomerDto) {
    return withTenantContext(tenantId, async (tx) => {
      const existing = await tx.customer.findFirst({ where: { id, tenantId } });
      if (!existing) throw new NotFoundException('Cliente no encontrado');
      return tx.customer.update({ where: { id }, data: dto });
    });
  }

  async getAccount(tenantId: string, id: string, page = 1, limit = 50) {
    return withTenantContext(tenantId, async (tx) => {
      const customer = await tx.customer.findFirst({ where: { id, tenantId } });
      if (!customer) throw new NotFoundException('Cliente no encontrado');

      const [total, movements] = await Promise.all([
        tx.customerAccountMovement.count({
          where: { tenantId, customerId: id },
        }),
        tx.customerAccountMovement.findMany({
          where: { tenantId, customerId: id },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
      ]);

      return {
        customer,
        movements: { data: movements, total, page, limit },
      };
    });
  }

  // El cobro en efectivo tiene que entrar al cajón de un turno ABIERTO —
  // si no, esa plata queda invisible para computeCashSalesTotal
  // (cash-shifts.service.ts) y el arqueo cierra con un sobrante fantasma.
  // Los demás medios de pago no tocan CashMovement.
  async registerPayment(
    tenantId: string,
    actor: AuthUser,
    customerId: string,
    dto: RegisterAccountPaymentDto,
  ) {
    return withTenantContext(tenantId, async (tx) => {
      const customer = await tx.customer.findFirst({
        where: { id: customerId, tenantId },
      });
      if (!customer) throw new NotFoundException('Cliente no encontrado');

      // Idempotencia: si esta key ya se usó, devolver el resultado anterior
      // en vez de cobrar dos veces por un doble clic / reintento de red.
      if (dto.idempotencyKey) {
        const existing = await tx.customerAccountMovement.findUnique({
          where: {
            tenantId_idempotencyKey: {
              tenantId,
              idempotencyKey: dto.idempotencyKey,
            },
          },
        });
        if (existing)
          return { balance: existing.balanceAfter, movement: existing };
      }

      let cashShift: { id: string; storeId: string } | null = null;
      if (dto.method === 'CASH') {
        if (!dto.cashShiftId) {
          throw new BadRequestException(
            'Un cobro en efectivo necesita indicar el turno de caja',
          );
        }
        const shift = await tx.cashShift.findFirst({
          where: { id: dto.cashShiftId, tenantId },
        });
        if (!shift) throw new NotFoundException('Turno de caja no encontrado');
        if (shift.status !== 'OPEN') {
          throw new BadRequestException('El turno de caja no está abierto');
        }
        cashShift = { id: shift.id, storeId: shift.storeId };
      }

      const { balance, movement } = await applyAccountMovement(tx, {
        tenantId,
        customerId,
        storeId: cashShift?.storeId,
        type: 'PAYMENT',
        delta: -Math.abs(dto.amount),
        cashShiftId: cashShift?.id,
        paymentMethod: dto.method,
        reference: dto.reference,
        notes: dto.notes,
        userId: actor.userId,
        idempotencyKey: dto.idempotencyKey,
      });

      if (cashShift) {
        await tx.cashMovement.create({
          data: {
            tenantId,
            cashShiftId: cashShift.id,
            userId: actor.userId,
            type: 'INFLOW',
            amount: dto.amount,
            reason: `Cobro cuenta corriente — ${customer.name}`,
          },
        });
      }

      await this.auditService.record(tx, tenantId, {
        storeId: cashShift?.storeId,
        userId: actor.userId,
        userEmail: actor.email,
        action: 'customer.account.payment',
        entityType: 'Customer',
        entityId: customerId,
        metadata: {
          amount: dto.amount,
          method: dto.method,
          balanceAfter: balance.toString(),
        },
      });

      return { balance, movement };
    });
  }

  async registerAdjustment(
    tenantId: string,
    actor: AuthUser,
    customerId: string,
    dto: RegisterAccountAdjustmentDto,
  ) {
    return withTenantContext(tenantId, async (tx) => {
      const customer = await tx.customer.findFirst({
        where: { id: customerId, tenantId },
      });
      if (!customer) throw new NotFoundException('Cliente no encontrado');

      const { balance, movement } = await applyAccountMovement(tx, {
        tenantId,
        customerId,
        type: 'ADJUSTMENT',
        delta: dto.delta,
        notes: dto.reason,
        userId: actor.userId,
      });

      await this.auditService.record(tx, tenantId, {
        userId: actor.userId,
        userEmail: actor.email,
        action: 'customer.account.adjustment',
        entityType: 'Customer',
        entityId: customerId,
        metadata: {
          delta: dto.delta,
          reason: dto.reason,
          balanceAfter: balance.toString(),
        },
      });

      return { balance, movement };
    });
  }
}
