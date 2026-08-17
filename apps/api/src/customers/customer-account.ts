import { BadRequestException, NotFoundException } from '@nestjs/common';
import type {
  TransactionClient,
  AccountMovementType,
  PaymentMethod,
} from '@pos/database';

export interface ApplyAccountMovementParams {
  tenantId: string;
  customerId: string;
  storeId?: string | null;
  type: AccountMovementType;
  // Con signo: positivo aumenta la deuda, negativo la reduce.
  delta: number;
  orderId?: string | null;
  cashShiftId?: string | null;
  paymentMethod?: PaymentMethod | null;
  reference?: string | null;
  notes?: string | null;
  userId: string;
  idempotencyKey?: string | null;
}

// Helper compartido por OrdersService (venta a cuenta corriente = CHARGE) y
// CustomersService (PAYMENT/ADJUSTMENT/CHARGE_REVERSAL) — vive fuera de
// ambos módulos a propósito, como función simple sin DI, para no crear una
// dependencia circular entre OrdersModule y CustomersModule.
//
// Guardia atómica en una sola sentencia (mismo patrón que decrementStock
// más arriba en este archivo, o el descuento de stock documentado en
// docs/ARCHITECTURE.md §3): si el delta es positivo y supera creditLimit,
// 0 filas afectadas — sin necesidad de un lock pesimista sobre la fila del
// cliente. Un delta negativo (pago, reversa) nunca lo bloquea el límite.
export async function applyAccountMovement(
  tx: TransactionClient,
  params: ApplyAccountMovementParams,
) {
  const affected = await tx.$executeRaw`
    UPDATE "Customer"
    SET "accountBalance" = "accountBalance" + ${params.delta}
    WHERE id = ${params.customerId} AND "tenantId" = ${params.tenantId}
      AND (
        ${params.delta} <= 0
        OR "creditLimit" IS NULL
        OR "accountBalance" + ${params.delta} <= "creditLimit"
      )
  `;

  if (affected === 0) {
    const exists = await tx.customer.findFirst({
      where: { id: params.customerId, tenantId: params.tenantId },
    });
    if (!exists) throw new NotFoundException('Cliente no encontrado');
    throw new BadRequestException(
      'La operación supera el límite de cuenta corriente del cliente',
    );
  }

  const customer = await tx.customer.findUniqueOrThrow({
    where: { id: params.customerId },
  });

  const movement = await tx.customerAccountMovement.create({
    data: {
      tenantId: params.tenantId,
      customerId: params.customerId,
      storeId: params.storeId ?? undefined,
      type: params.type,
      amount: params.delta,
      balanceAfter: customer.accountBalance,
      orderId: params.orderId ?? undefined,
      cashShiftId: params.cashShiftId ?? undefined,
      paymentMethod: params.paymentMethod ?? undefined,
      reference: params.reference ?? undefined,
      notes: params.notes ?? undefined,
      userId: params.userId,
      idempotencyKey: params.idempotencyKey ?? undefined,
    },
  });

  return { balance: customer.accountBalance, movement };
}
