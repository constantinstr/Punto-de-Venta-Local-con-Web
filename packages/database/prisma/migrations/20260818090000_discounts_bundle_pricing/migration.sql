-- CreateEnum
CREATE TYPE "BundlePricingMode" AS ENUM ('MANUAL', 'DERIVED');

-- AlterTable: precio de combos derivado de sus componentes.
-- MANUAL por defecto a propósito: los combos que ya existen conservan su
-- precio actual y su comportamiento: nadie se despierta con precios nuevos
-- por haber corrido una migración.
ALTER TABLE "Product" ADD COLUMN "bundlePricingMode" "BundlePricingMode" NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "Product" ADD COLUMN "bundleDiscountPercent" DECIMAL(5,2);

-- CreateTable: tope de descuento por rol.
-- No se siembra ninguna fila: sin fila = sin tope, que es exactamente el
-- comportamiento de hoy. El dueño pone los límites desde
-- Configuración → Descuentos.
CREATE TABLE "DiscountPolicy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "maxPercent" DECIMAL(5,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscountPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DiscountPolicy_tenantId_role_key" ON "DiscountPolicy"("tenantId", "role");

-- CreateIndex
CREATE INDEX "DiscountPolicy_tenantId_idx" ON "DiscountPolicy"("tenantId");

-- AddForeignKey
ALTER TABLE "DiscountPolicy" ADD CONSTRAINT "DiscountPolicy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RowLevelSecurity
ALTER TABLE "DiscountPolicy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DiscountPolicy" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "DiscountPolicy"
  USING ("tenantId" = current_setting('app.tenant_id', true));

-- Índice para el recálculo de combos: BundlePricingService busca "qué combos
-- contienen a este componente" en cada cambio de precio, y sin esto sería un
-- scan completo de BundleItem en cada actualización masiva.
CREATE INDEX "BundleItem_componentProductId_idx" ON "BundleItem"("componentProductId");
