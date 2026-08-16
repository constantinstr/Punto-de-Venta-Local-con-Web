-- Sprint 7: sincronización bidireccional con WooCommerce.
-- SyncQueue (scaffolding de Fase 1, nunca usado por código de aplicación —
-- 0 filas) se reemplaza por SyncLog: la cola real ahora vive en BullMQ/Redis
-- (ver apps/api/src/woocommerce/woo-queue.service.ts), esta tabla es
-- puramente la bitácora de auditoría. Los tres enums viejos (SyncEntityType,
-- SyncDirection, SyncStatus) solo los usaba SyncQueue, así que se recrean
-- directo con los valores finales en vez de hacer el swap
-- CREATE-new/RENAME/DROP-old (ese patrón es para preservar datos existentes
-- en una columna que sigue viva; acá la tabla que los usaba se borra en el
-- mismo paso, no hay datos que preservar).

-- DropForeignKey
ALTER TABLE "SyncQueue" DROP CONSTRAINT "SyncQueue_tenantId_fkey";

-- DropTable
DROP TABLE "SyncQueue";

-- DropEnum (recreados abajo con los valores finales)
DROP TYPE "SyncEntityType";
DROP TYPE "SyncDirection";
DROP TYPE "SyncStatus";

-- CreateEnum
CREATE TYPE "SyncEntityType" AS ENUM ('PRODUCT', 'STOCK', 'ORDER');
CREATE TYPE "SyncDirection" AS ENUM ('OUTBOUND_TO_WOO', 'INBOUND_FROM_WOO');
CREATE TYPE "SyncStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');
CREATE TYPE "WooSyncStatus" AS ENUM ('SYNCED', 'PENDING', 'ERROR', 'IGNORED');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "wooLastSyncAt" TIMESTAMP(3),
ADD COLUMN     "wooSyncStatus" "WooSyncStatus" NOT NULL DEFAULT 'IGNORED';

-- AlterTable
ALTER TABLE "ProductVariant" DROP COLUMN "wooVariationId",
ADD COLUMN     "wooLastSyncAt" TIMESTAMP(3),
ADD COLUMN     "wooSyncStatus" "WooSyncStatus" NOT NULL DEFAULT 'IGNORED',
ADD COLUMN     "wooVariantId" INTEGER;

-- AlterTable
ALTER TABLE "WooCommerceConfig" DROP COLUMN "siteUrl",
ADD COLUMN     "apiUrl" TEXT NOT NULL,
ADD COLUMN     "syncStockInbound" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "syncStockOutbound" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "tenantId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "SyncLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityType" "SyncEntityType" NOT NULL,
    "direction" "SyncDirection" NOT NULL,
    "status" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SyncLog_tenantId_createdAt_idx" ON "SyncLog"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "SyncLog_tenantId_status_idx" ON "SyncLog"("tenantId", "status");

-- CreateIndex
CREATE INDEX "WooCommerceConfig_tenantId_idx" ON "WooCommerceConfig"("tenantId");

-- AddForeignKey
ALTER TABLE "WooCommerceConfig" ADD CONSTRAINT "WooCommerceConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncLog" ADD CONSTRAINT "SyncLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RowLevelSecurity: SyncLog sigue el mismo patrón que Invoice/FiscalConfig
-- (Sprint 6) — siempre se escribe con tenantId ya resuelto (por JWT en los
-- endpoints autenticados, o por el lookup de WooCommerceConfig en el worker
-- de BullMQ para el flujo de webhooks). WooCommerceConfig NO lleva RLS
-- todavía: ver el comentario en el modelo dentro de schema.prisma.
ALTER TABLE "SyncLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SyncLog" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SyncLog"
  USING ("tenantId" = current_setting('app.tenant_id', true));
