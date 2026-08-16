-- AlterEnum
BEGIN;
CREATE TYPE "ProductType_new" AS ENUM ('SIMPLE', 'VARIABLE', 'BUNDLE');
ALTER TABLE "public"."Product" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "Product" ALTER COLUMN "type" TYPE "ProductType_new" USING ("type"::text::"ProductType_new");
ALTER TYPE "ProductType" RENAME TO "ProductType_old";
ALTER TYPE "ProductType_new" RENAME TO "ProductType";
DROP TYPE "public"."ProductType_old";
ALTER TABLE "Product" ALTER COLUMN "type" SET DEFAULT 'SIMPLE';
COMMIT;

-- DropForeignKey
ALTER TABLE "StoreStock" DROP CONSTRAINT "StoreStock_productId_fkey";

-- DropForeignKey
ALTER TABLE "StoreStock" DROP CONSTRAINT "StoreStock_storeId_fkey";

-- DropForeignKey
ALTER TABLE "StoreStock" DROP CONSTRAINT "StoreStock_variantId_fkey";

-- DropIndex
DROP INDEX "Product_tenantId_barcode_idx";

-- DropIndex
DROP INDEX "ProductVariant_barcode_idx";

-- DropIndex
DROP INDEX "ProductVariant_productId_sku_key";

-- AlterTable
ALTER TABLE "BundleItem" ADD COLUMN     "componentVariantId" TEXT;

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN     "costPrice" DECIMAL(12,2),
ADD COLUMN     "tenantId" TEXT NOT NULL;

-- DropTable
DROP TABLE "StoreStock";

-- CreateTable
CREATE TABLE "StockLevel" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT,
    "variantId" TEXT,
    "quantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "reservedQuantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "minAlertStock" DECIMAL(12,3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockLevel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockLevel_tenantId_storeId_idx" ON "StockLevel"("tenantId", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "StockLevel_storeId_productId_variantId_key" ON "StockLevel"("storeId", "productId", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_tenantId_barcode_key" ON "Product"("tenantId", "barcode");

-- CreateIndex
CREATE INDEX "ProductVariant_productId_idx" ON "ProductVariant"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_tenantId_sku_key" ON "ProductVariant"("tenantId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_tenantId_barcode_key" ON "ProductVariant"("tenantId", "barcode");

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BundleItem" ADD CONSTRAINT "BundleItem_componentVariantId_fkey" FOREIGN KEY ("componentVariantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLevel" ADD CONSTRAINT "StockLevel_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLevel" ADD CONSTRAINT "StockLevel_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLevel" ADD CONSTRAINT "StockLevel_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLevel" ADD CONSTRAINT "StockLevel_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Row Level Security: ProductVariant y StockLevel ahora tienen tenantId
-- propio, así que reciben la misma política que el resto de las tablas
-- tenant-scoped (ver prisma/migrations/..._enable_row_level_security).
ALTER TABLE "ProductVariant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProductVariant" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ProductVariant"
  USING ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "StockLevel" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StockLevel" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "StockLevel"
  USING ("tenantId" = current_setting('app.tenant_id', true));

