-- AlterTable
ALTER TABLE "Customer" ADD COLUMN "creditLimit" DECIMAL(12,2);

-- CreateEnum
CREATE TYPE "AccountMovementType" AS ENUM ('CHARGE', 'PAYMENT', 'ADJUSTMENT', 'CHARGE_REVERSAL');

-- CreateTable
CREATE TABLE "CustomerAccountMovement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "storeId" TEXT,
    "type" "AccountMovementType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "balanceAfter" DECIMAL(12,2) NOT NULL,
    "orderId" TEXT,
    "cashShiftId" TEXT,
    "paymentMethod" "PaymentMethod",
    "reference" TEXT,
    "notes" TEXT,
    "userId" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerAccountMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerAccountMovement_tenantId_idempotencyKey_key" ON "CustomerAccountMovement"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerAccountMovement_orderId_type_key" ON "CustomerAccountMovement"("orderId", "type");

-- CreateIndex
CREATE INDEX "CustomerAccountMovement_tenantId_customerId_createdAt_idx" ON "CustomerAccountMovement"("tenantId", "customerId", "createdAt");

-- AddForeignKey
ALTER TABLE "CustomerAccountMovement" ADD CONSTRAINT "CustomerAccountMovement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAccountMovement" ADD CONSTRAINT "CustomerAccountMovement_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAccountMovement" ADD CONSTRAINT "CustomerAccountMovement_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAccountMovement" ADD CONSTRAINT "CustomerAccountMovement_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAccountMovement" ADD CONSTRAINT "CustomerAccountMovement_cashShiftId_fkey" FOREIGN KEY ("cashShiftId") REFERENCES "CashShift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAccountMovement" ADD CONSTRAINT "CustomerAccountMovement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RowLevelSecurity
ALTER TABLE "CustomerAccountMovement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomerAccountMovement" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CustomerAccountMovement"
  USING ("tenantId" = current_setting('app.tenant_id', true));
