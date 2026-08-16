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
    const [inflows, outflows] = await Promise.all([
      tx.cashMovement.aggregate({
        where: { cashShiftId: shift.id, type: CashMovementType.INFLOW },
        _sum: { amount: true },
      }),
      tx.cashMovement.aggregate({
        where: { cashShiftId: shift.id, type: CashMovementType.OUTFLOW },
        _sum: { amount: true },
      }),
    ]);

    const totalInflows = Number(inflows._sum.amount ?? 0);
    const totalOutflows = Number(outflows._sum.amount ?? 0);
    const cashSalesTotal = 0; // TODO Sprint 5: sumar Payment.method=CASH de las órdenes de este turno

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
