import { Injectable } from '@nestjs/common';
import {
  Prisma,
  withTenantContext,
  type TransactionClient,
} from '@pos/database';

export interface AuditEntry {
  storeId?: string | null;
  userId?: string | null;
  userEmail: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  // Se une a la transacción del llamador a propósito: es una escritura
  // puramente local (Postgres), nunca de red — nunca llamar a esto desde
  // dentro de una transacción que también haga fetch() a un servicio
  // externo (ver la lección documentada en woo-worker.service.ts
  // markSyncLog y invoices.service.ts issueFiscal: un fetch lento adentro
  // de una transacción interactiva de Prisma la revienta por timeout).
  record(tx: TransactionClient, tenantId: string, entry: AuditEntry) {
    return tx.auditLog.create({
      data: {
        tenantId,
        storeId: entry.storeId ?? null,
        userId: entry.userId ?? null,
        userEmail: entry.userEmail,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        metadata: (entry.metadata ?? undefined) as
          Prisma.InputJsonValue | undefined,
      },
    });
  }

  // Para el puñado de casos que auditan algo que no ocurrió dentro de una
  // transacción de negocio ya abierta (p.ej. un evento que se resuelve
  // después de encolar un job async). La mayoría de los call sites deben
  // preferir record(tx, ...) para que la auditoría nunca quede huérfana de
  // un rollback.
  async recordStandalone(tenantId: string, entry: AuditEntry) {
    return withTenantContext(tenantId, (tx) =>
      this.record(tx, tenantId, entry),
    );
  }

  findAll(
    tenantId: string,
    query: {
      entityType?: string;
      entityId?: string;
      userId?: string;
      from?: string;
      to?: string;
      page?: number;
      limit?: number;
    },
  ) {
    return withTenantContext(tenantId, async (tx) => {
      const page = query.page ?? 1;
      const limit = query.limit ?? 50;
      const where = {
        tenantId,
        entityType: query.entityType,
        entityId: query.entityId,
        userId: query.userId,
        createdAt: {
          gte: query.from ? new Date(query.from) : undefined,
          lte: query.to ? new Date(`${query.to}T23:59:59.999`) : undefined,
        },
      };

      const [data, total] = await Promise.all([
        tx.auditLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        tx.auditLog.count({ where }),
      ]);

      return { data, total, page, limit };
    });
  }
}
