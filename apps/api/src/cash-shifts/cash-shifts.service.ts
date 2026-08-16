import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  withTenantContext,
  CashMovementType,
  CashRegisterStatus,
  CashShiftStatus,
  OrderStatus,
  PaymentMethod,
  UserRole,
  Prisma,
  type TransactionClient,
  type CashShift,
} from '@pos/database';
import type { AuthUser } from '../common/types/auth-user';
import type { OpenShiftDto } from './dto/open-shift.dto';
import type { CreateMovementDto } from './dto/create-movement.dto';
import type { CloseShiftDto } from './dto/close-shift.dto';

const SHIFT_INCLUDE = {
  user: { select: { id: true, fullName: true, email: true } },
  cashRegister: true,
} satisfies Prisma.CashShiftInclude;

export interface ShiftSummary {
  cashShiftId: string;
  status: CashShiftStatus;
  initialAmount: number;
  totalInflows: number;
  totalOutflows: number;
  cashSalesTotal: number; // placeholder — se conecta con ventas en efectivo en Sprint 5
  expectedCash: number;
}

@Injectable()
export class CashShiftsService {
  async open(tenantId: string, actor: AuthUser, dto: OpenShiftDto) {
    return withTenantContext(tenantId, async (tx) => {
      const register = await tx.cashRegister.findFirst({
        where: { id: dto.cashRegisterId, tenantId },
      });
      if (!register) throw new NotFoundException('Caja no encontrada');
      if (register.status !== CashRegisterStatus.ACTIVE) {
        throw new BadRequestException('Esta caja está inactiva');
      }

      const openShift = await tx.cashShift.findFirst({
        where: {
          cashRegisterId: dto.cashRegisterId,
          status: CashShiftStatus.OPEN,
        },
      });
      if (openShift) {
        throw new ConflictException('Ya hay un turno abierto en esta caja');
      }

      try {
        return await tx.cashShift.create({
          data: {
            tenantId,
            storeId: register.storeId,
            cashRegisterId: register.id,
            userId: actor.userId,
            initialAmount: dto.initialAmount,
          },
          include: SHIFT_INCLUDE,
        });
      } catch (err) {
        // Carrera entre dos aperturas simultáneas: el índice único parcial
        // (un solo OPEN por caja) la frena aunque el check de arriba no la vea a tiempo.
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          throw new ConflictException('Ya hay un turno abierto en esta caja');
        }
        throw err;
      }
    });
  }

  async getCurrent(tenantId: string, cashRegisterId: string) {
    return withTenantContext(tenantId, (tx) =>
      tx.cashShift.findFirst({
        where: { tenantId, cashRegisterId, status: CashShiftStatus.OPEN },
        include: SHIFT_INCLUDE,
      }),
    );
  }

  async findOne(tenantId: string, actor: AuthUser, shiftId: string) {
    return withTenantContext(tenantId, async (tx) => {
      const shift = await this.requireShift(tx, tenantId, shiftId);
      this.assertCanOperate(actor, shift);
      return tx.cashShift.findUniqueOrThrow({
        where: { id: shiftId },
        include: {
          ...SHIFT_INCLUDE,
          movements: { orderBy: { createdAt: 'desc' } },
        },
      });
    });
  }

  async listMovements(tenantId: string, actor: AuthUser, shiftId: string) {
    return withTenantContext(tenantId, async (tx) => {
      const shift = await this.requireShift(tx, tenantId, shiftId);
      this.assertCanOperate(actor, shift);
      return tx.cashMovement.findMany({
        where: { cashShiftId: shiftId },
        include: { user: { select: { id: true, fullName: true } } },
        orderBy: { createdAt: 'desc' },
      });
    });
  }

  async addMovement(
    tenantId: string,
    actor: AuthUser,
    shiftId: string,
    dto: CreateMovementDto,
  ) {
    return withTenantContext(tenantId, async (tx) => {
      const shift = await this.requireShift(tx, tenantId, shiftId);
      this.assertCanOperate(actor, shift);
      if (shift.status !== CashShiftStatus.OPEN) {
        throw new BadRequestException('El turno ya está cerrado');
      }

      return tx.cashMovement.create({
        data: {
          tenantId,
          cashShiftId: shiftId,
          userId: actor.userId,
          type: dto.type,
          amount: dto.amount,
          reason: dto.reason,
        },
      });
    });
  }

  async getSummary(
    tenantId: string,
    actor: AuthUser,
    shiftId: string,
  ): Promise<ShiftSummary> {
    return withTenantContext(tenantId, async (tx) => {
      const shift = await this.requireShift(tx, tenantId, shiftId);
      this.assertCanOperate(actor, shift);
      return this.computeSummary(tx, shift);
    });
  }

  async close(
    tenantId: string,
    actor: AuthUser,
    shiftId: string,
    dto: CloseShiftDto,
  ) {
    return withTenantContext(tenantId, async (tx) => {
      const shift = await this.requireShift(tx, tenantId, shiftId);
      this.assertCanOperate(actor, shift);
      if (shift.status !== CashShiftStatus.OPEN) {
        throw new BadRequestException('El turno ya está cerrado');
      }

      const summary = await this.computeSummary(tx, shift);
      const difference = dto.actualCash - summary.expectedCash;

      return tx.cashShift.update({
        where: { id: shiftId },
        data: {
          actualCash: dto.actualCash,
          expectedCash: summary.expectedCash,
          difference,
          notes: dto.notes,
          status: CashShiftStatus.CLOSED,
          closedAt: new Date(),
        },
        include: SHIFT_INCLUDE,
      });
    });
  }

  private async computeSummary(
    tx: TransactionClient,
    shift: CashShift,
  ): Promise<ShiftSummary> {
    const [inflows, outflows, cashSalesTotal] = await Promise.all([
      tx.cashMovement.aggregate({
        where: { cashShiftId: shift.id, type: CashMovementType.INFLOW },
        _sum: { amount: true },
      }),
      tx.cashMovement.aggregate({
        where: { cashShiftId: shift.id, type: CashMovementType.OUTFLOW },
        _sum: { amount: true },
      }),
      this.computeCashSalesTotal(tx, shift.id),
    ]);

    const totalInflows = Number(inflows._sum.amount ?? 0);
    const totalOutflows = Number(outflows._sum.amount ?? 0);

    return {
      cashShiftId: shift.id,
      status: shift.status,
      initialAmount: Number(shift.initialAmount),
      totalInflows,
      totalOutflows,
      cashSalesTotal,
      expectedCash:
        Number(shift.initialAmount) +
        totalInflows -
        totalOutflows +
        cashSalesTotal,
    };
  }

  // El efectivo que realmente queda en el cajón por una venta no es la
  // suma cruda de los pagos CASH: si el cliente pagó $1000 en efectivo por
  // una compra de $850, el cajón solo gana $850 (los $150 de vuelto salen
  // del mismo cajón). Por venta: min(cashPagado, max(0, total - noEfectivo)).
  // Las órdenes canceladas no aportan (el efectivo ya se devolvió).
  private async computeCashSalesTotal(
    tx: TransactionClient,
    shiftId: string,
  ): Promise<number> {
    const orders = await tx.order.findMany({
      where: { cashShiftId: shiftId, status: { not: OrderStatus.CANCELLED } },
      include: { payments: true },
    });

    let cashSalesTotal = 0;
    for (const order of orders) {
      const cashPaid = order.payments
        .filter((p) => p.method === PaymentMethod.CASH)
        .reduce((sum, p) => sum + Number(p.amount), 0);
      if (cashPaid === 0) continue;
      const nonCashPaid = order.payments
        .filter((p) => p.method !== PaymentMethod.CASH)
        .reduce((sum, p) => sum + Number(p.amount), 0);
      const netCash = Math.min(
        cashPaid,
        Math.max(0, Number(order.total) - nonCashPaid),
      );
      cashSalesTotal += netCash;
    }
    return cashSalesTotal;
  }

  private async requireShift(
    tx: TransactionClient,
    tenantId: string,
    shiftId: string,
  ): Promise<CashShift> {
    const shift = await tx.cashShift.findFirst({
      where: { id: shiftId, tenantId },
    });
    if (!shift) throw new NotFoundException('Turno no encontrado');
    return shift;
  }

  // El cajero solo opera su propio turno; encargado/admin/dueño pueden
  // intervenir cualquier turno del tenant (arqueo sorpresa, cierre forzado).
  private assertCanOperate(actor: AuthUser, shift: CashShift) {
    if (actor.role === UserRole.CASHIER && shift.userId !== actor.userId) {
      throw new ForbiddenException('Este turno pertenece a otro cajero');
    }
  }
}
