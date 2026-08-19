import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { withPlatformContext, withTenantContext } from '@pos/database';

const DEFAULT_PURGE_GRACE_DAYS = 60;

// Borra tenants demo vencidos y TODAS sus filas hijas. Ninguna FK del schema
// tiene onDelete: Cascade (decisión deliberada, ver plan de implementación
// §5 — un tenant.delete() de un lineazo sería una pistola cargada apuntando
// a cualquier tenant real), así que el orden de borrado de abajo respeta a
// mano el grafo de FKs. Tres tablas (BundleItem, OrderItemBundleComponent,
// RefreshToken) no tienen columna tenantId ni policy RLS propia — se borran
// por SQL crudo con un subquery contra su tabla padre; SIN ese subquery
// borrarían filas de OTROS tenants, porque nada las limita.
@Injectable()
export class DemoPurgeService {
  private readonly logger = new Logger(DemoPurgeService.name);

  constructor(private readonly config: ConfigService) {}

  // DEMO_PURGE_GRACE_DAYS es la ventana entre "se bloquea" (demoExpiresAt,
  // que SubscriptionEnforcementInterceptor ya corta al instante) y "se borra
  // de verdad" — a propósito son dos momentos distintos: alguien que decide
  // pagar en el medio todavía tiene sus datos intactos para convertir (ver
  // SubscriptionService.convertDemoIfPaid). Es un placeholder de negocio
  // (60 días), por eso vive en una env var y no hardcodeado.
  private get graceDays(): number {
    const raw = Number(this.config.get('DEMO_PURGE_GRACE_DAYS') ?? DEFAULT_PURGE_GRACE_DAYS);
    return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_PURGE_GRACE_DAYS;
  }

  // Fase 1: encontrar qué tenants demo llevan más de graceDays BLOQUEADOS
  // (no simplemente vencidos — esa es una fecha distinta, ver arriba).
  // withPlatformContext es lo único que puede leer Tenant sin tener ya un
  // tenantId de sesión (ver tenant-context.ts) — pero SOLO ve Tenant y
  // SubscriptionEvent, no las tablas hijas, así que la purga real de cada
  // tenant pasa a la fase 2, uno por vez, con su propio contexto RLS.
  async purgeExpired(): Promise<{ purged: number; failed: number }> {
    const cutoff = new Date(Date.now() - this.graceDays * 24 * 60 * 60 * 1000);
    const expired = await withPlatformContext((tx) =>
      tx.tenant.findMany({
        where: { planTier: 'demo', demoExpiresAt: { lt: cutoff } },
        select: { id: true },
      }),
    );

    let purged = 0;
    let failed = 0;
    // Un tenant por vez, cada uno en su propio try/catch: si uno falla (p.
    // ej. una FK no prevista) no aborta el resto del batch, y se reintenta
    // solo — al no borrarse, sigue apareciendo en la próxima corrida.
    for (const { id } of expired) {
      try {
        await this.purgeTenant(id);
        purged++;
      } catch (err) {
        failed++;
        this.logger.error(
          `Purga de tenant demo ${id} falló — se reintenta en la próxima corrida: ${String(err)}`,
        );
      }
    }
    if (expired.length > 0) {
      this.logger.log(
        `Purga de demos: ${purged} borrados, ${failed} fallidos de ${expired.length} vencidos`,
      );
    }
    return { purged, failed };
  }

  // Fase 2. Público (no solo interno): el test e2e de purga lo llama
  // directamente en vez de manipular fechas y esperar al job.
  async purgeTenant(tenantId: string): Promise<void> {
    await withTenantContext(tenantId, async (tx) => {
      // Defensa en profundidad: nunca borrar un tenant que no sea demo,
      // aunque quien llame a este método se haya equivocado de id.
      const tenant = await tx.tenant.findUnique({
        where: { id: tenantId },
        select: { planTier: true },
      });
      if (!tenant) return; // ya no existe — nada que hacer, no es un error.
      if (tenant.planTier !== 'demo') {
        throw new Error(
          `purgeTenant se llamó sobre un tenant NO demo (${tenantId}) — abortado.`,
        );
      }

      // 1) Hijas de OrderItem / Order (sin FK con cascade).
      await tx.$executeRaw`
        DELETE FROM "OrderItemBundleComponent"
        WHERE "orderItemId" IN (SELECT id FROM "OrderItem" WHERE "tenantId" = ${tenantId})
      `;
      await tx.payment.deleteMany({ where: { tenantId } });

      // Notas de crédito antes que la factura que anulan (relatedInvoiceId
      // es un self-FK @unique).
      await tx.invoice.deleteMany({
        where: { tenantId, relatedInvoiceId: { not: null } },
      });
      await tx.invoice.deleteMany({ where: { tenantId } });

      await tx.quoteItem.deleteMany({ where: { tenantId } });
      await tx.customerAccountMovement.deleteMany({ where: { tenantId } });
      await tx.quote.deleteMany({ where: { tenantId } }); // referencia Order (orderId único)
      await tx.orderItem.deleteMany({ where: { tenantId } });
      await tx.order.deleteMany({ where: { tenantId } });

      // 2) Caja.
      await tx.cashMovement.deleteMany({ where: { tenantId } });
      await tx.cashShift.deleteMany({ where: { tenantId } });
      await tx.cashRegister.deleteMany({ where: { tenantId } });

      // 3) Compras.
      await tx.purchaseItem.deleteMany({ where: { tenantId } });
      await tx.purchase.deleteMany({ where: { tenantId } });

      // 4) Catálogo — BundleItem no tiene tenantId, se borra por join.
      await tx.stockLevel.deleteMany({ where: { tenantId } });
      await tx.$executeRaw`
        DELETE FROM "BundleItem"
        WHERE "bundleProductId" IN (SELECT id FROM "Product" WHERE "tenantId" = ${tenantId})
           OR "componentProductId" IN (SELECT id FROM "Product" WHERE "tenantId" = ${tenantId})
      `;
      await tx.productVariant.deleteMany({ where: { tenantId } });
      await tx.product.deleteMany({ where: { tenantId } });

      // Category.parentId es un self-FK: se desarma antes de borrar en vez
      // de ordenar hojas-primero (más simple y son pocas filas en un demo).
      await tx.category.updateMany({
        where: { tenantId },
        data: { parentId: null },
      });
      await tx.category.deleteMany({ where: { tenantId } });

      // 5) Clientes y proveedores.
      await tx.customer.deleteMany({ where: { tenantId } });
      await tx.supplier.deleteMany({ where: { tenantId } });

      // 6) Configuración e integraciones — sin dependientes.
      await tx.discountPolicy.deleteMany({ where: { tenantId } });
      await tx.syncLog.deleteMany({ where: { tenantId } });
      await tx.wooCommerceConfig.deleteMany({ where: { tenantId } });
      await tx.tiendanubeConfig.deleteMany({ where: { tenantId } });
      await tx.fiscalConfig.deleteMany({ where: { tenantId } });
      await tx.auditLog.deleteMany({ where: { tenantId } });

      // 7) Usuarios y locales. RefreshToken no tiene tenantId, se borra por
      // join (mismo motivo que BundleItem/OrderItemBundleComponent). El m2m
      // implícito User<->Store (storeAccess) lo limpia Postgres solo: las
      // tablas de join implícitas de Prisma se crean con ON DELETE CASCADE.
      await tx.$executeRaw`
        DELETE FROM "RefreshToken"
        WHERE "userId" IN (SELECT id FROM "User" WHERE "tenantId" = ${tenantId})
      `;
      await tx.user.deleteMany({ where: { tenantId } });
      await tx.store.deleteMany({ where: { tenantId } });

      // 8) El propio tenant y su historial de suscripción.
      await tx.subscriptionEvent.deleteMany({ where: { tenantId } });
      await tx.tenant.delete({ where: { id: tenantId } });
    });
  }
}
