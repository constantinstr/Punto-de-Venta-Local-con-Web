import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  withTenantContext,
  type Prisma,
  type SyncDirection,
  type SyncEntityType,
  type TransactionClient,
} from '@pos/database';
import { WooQueueService } from './woo-queue.service';

@Injectable()
export class SyncLogService {
  constructor(private readonly queueService: WooQueueService) {}

  // Se crea siempre con status=PENDING al encolar el job de BullMQ — el
  // worker la actualiza a SUCCESS/FAILED al terminar (ver
  // woo-worker.service.ts). Corre en la misma tx del caller cuando se le
  // pasa una (para no dejar una fila PENDING huérfana si la tx que armó el
  // job termina haciendo rollback).
  async create(
    tx: TransactionClient,
    tenantId: string,
    entityType: SyncEntityType,
    direction: SyncDirection,
    payload: Prisma.InputJsonValue,
  ) {
    return tx.syncLog.create({
      data: { tenantId, entityType, direction, payload, status: 'PENDING' },
    });
  }

  async markSuccess(
    tenantId: string,
    id: string,
    payload?: Prisma.InputJsonValue,
  ) {
    return withTenantContext(tenantId, (tx) =>
      tx.syncLog.update({
        where: { id },
        data: {
          status: 'SUCCESS',
          errorMessage: null,
          ...(payload !== undefined ? { payload } : {}),
        },
      }),
    );
  }

  async markFailed(tenantId: string, id: string, errorMessage: string) {
    return withTenantContext(tenantId, (tx) =>
      tx.syncLog.update({
        where: { id },
        data: { status: 'FAILED', errorMessage },
      }),
    );
  }

  async findRecent(tenantId: string, limit = 50) {
    return withTenantContext(tenantId, (tx) =>
      tx.syncLog.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
    );
  }

  // Reencola el mismo evento a partir de su payload guardado — solo tiene
  // sentido para filas FAILED (una PENDING ya tiene un job corriendo/
  // esperando en Redis, y una SUCCESS no tiene nada que reintentar).
  async retry(tenantId: string, id: string) {
    return withTenantContext(tenantId, async (tx) => {
      const log = await tx.syncLog.findFirst({ where: { id, tenantId } });
      if (!log)
        throw new NotFoundException('Registro de sincronización no encontrado');
      if (log.status !== 'FAILED') {
        throw new BadRequestException(
          'Solo se pueden reintentar registros con status FAILED',
        );
      }

      const payload = log.payload as Record<string, unknown>;
      const configId = payload.configId as string | undefined;
      if (!configId) {
        throw new BadRequestException(
          'Este registro no tiene datos suficientes para reintentarlo',
        );
      }

      const updated = await tx.syncLog.update({
        where: { id },
        data: { status: 'PENDING', errorMessage: null },
      });

      if (log.entityType === 'STOCK') {
        await this.queueService.addStockOutbound({
          syncLogId: id,
          tenantId,
          configId,
          wooProductId: payload.wooProductId as number,
          wooVariantId: (payload.wooVariantId as number | null) ?? undefined,
          quantity: payload.quantity as number,
        });
      } else if (log.entityType === 'ORDER') {
        await this.queueService.addOrderInbound({
          syncLogId: id,
          tenantId,
          configId,
          wcOrder: {
            id: payload.wooOrderId as number,
            status: payload.status as string,
            line_items:
              (payload.lineItems as {
                product_id: number;
                variation_id: number;
                quantity: number;
                sku?: string;
              }[]) ?? [],
          },
        });
      } else {
        throw new BadRequestException(
          'Los registros de tipo PRODUCT (sync de catálogo) no se reintentan individualmente — volvé a correr "Sincronizar catálogo"',
        );
      }

      return updated;
    });
  }
}
