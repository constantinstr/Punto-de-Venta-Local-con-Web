-- AlterEnum: SyncDirection nació con nombres de WooCommerce. Se agregan los
-- dos sentidos de Tienda Nube en vez de renombrar los existentes: renombrar
-- obligaría a reescribir las filas históricas de SyncLog y a tocar el módulo
-- de WooCommerce, que ya funciona.
ALTER TYPE "SyncDirection" ADD VALUE IF NOT EXISTS 'OUTBOUND_TO_TIENDANUBE';
ALTER TYPE "SyncDirection" ADD VALUE IF NOT EXISTS 'INBOUND_FROM_TIENDANUBE';

-- CreateTable
CREATE TABLE "TiendanubeConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "tnStoreId" TEXT NOT NULL,
    -- Cifrado con AES-256-GCM (ver EncryptionService): con este token se
    -- puede operar la tienda online del cliente, así que un dump de la base
    -- no debe exponerlo.
    "accessToken" TEXT NOT NULL,
    "scopes" TEXT,
    "syncStockOutbound" BOOLEAN NOT NULL DEFAULT true,
    "syncStockInbound" BOOLEAN NOT NULL DEFAULT true,
    "syncPriceOutbound" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TiendanubeConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TiendanubeConfig_storeId_key" ON "TiendanubeConfig"("storeId");

-- CreateIndex
CREATE INDEX "TiendanubeConfig_tenantId_idx" ON "TiendanubeConfig"("tenantId");

-- AddForeignKey
ALTER TABLE "TiendanubeConfig" ADD CONSTRAINT "TiendanubeConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TiendanubeConfig" ADD CONSTRAINT "TiendanubeConfig_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RowLevelSecurity
ALTER TABLE "TiendanubeConfig" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TiendanubeConfig" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TiendanubeConfig"
  USING ("tenantId" = current_setting('app.tenant_id', true));

-- AlterTable: ids remotos de Tienda Nube. Del lado de ellos incluso un
-- producto simple tiene una variante, y la ruta de stock cuelga de los dos
-- ids, así que hacen falta ambos.
ALTER TABLE "Product" ADD COLUMN "tnProductId" INTEGER;
ALTER TABLE "Product" ADD COLUMN "tnVariantId" INTEGER;
ALTER TABLE "ProductVariant" ADD COLUMN "tnProductId" INTEGER;
ALTER TABLE "ProductVariant" ADD COLUMN "tnVariantId" INTEGER;
