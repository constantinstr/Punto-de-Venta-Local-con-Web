-- CreateEnum
CREATE TYPE "CashRegisterStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- AlterEnum
BEGIN;
CREATE TYPE "CashMovementType_new" AS ENUM ('INFLOW', 'OUTFLOW');
ALTER TABLE "CashMovement" ALTER COLUMN "type" TYPE "CashMovementType_new" USING ("type"::text::"CashMovementType_new");
ALTER TYPE "CashMovementType" RENAME TO "CashMovementType_old";
ALTER TYPE "CashMovementType_new" RENAME TO "CashMovementType";
DROP TYPE "public"."CashMovementType_old";
COMMIT;

-- AlterTable
ALTER TABLE "CashMovement" ADD COLUMN     "tenantId" TEXT NOT NULL,
ADD COLUMN     "userId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "CashRegister" DROP COLUMN "isActive",
ADD COLUMN     "status" "CashRegisterStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "tenantId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "CashShift" DROP COLUMN "closingAmount",
DROP COLUMN "expectedAmount",
DROP COLUMN "openingAmount",
ADD COLUMN     "actualCash" DECIMAL(12,2),
ADD COLUMN     "expectedCash" DECIMAL(12,2),
ADD COLUMN     "initialAmount" DECIMAL(12,2) NOT NULL,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "storeId" TEXT NOT NULL,
ADD COLUMN     "tenantId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "CashMovement_tenantId_idx" ON "CashMovement"("tenantId");

-- CreateIndex
CREATE INDEX "CashRegister_tenantId_idx" ON "CashRegister"("tenantId");

-- CreateIndex
CREATE INDEX "CashShift_tenantId_idx" ON "CashShift"("tenantId");

-- AddForeignKey
ALTER TABLE "CashRegister" ADD CONSTRAINT "CashRegister_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashShift" ADD CONSTRAINT "CashShift_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashShift" ADD CONSTRAINT "CashShift_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Solo puede haber un turno OPEN por caja física a la vez. Índice único
-- parcial (no expresable en schema.prisma) — un intento de abrir un segundo
-- turno en la misma caja choca con esto y Postgres tira unique_violation
-- (23505), que el servicio traduce a un 409 claro.
CREATE UNIQUE INDEX "CashShift_one_open_per_register" ON "CashShift"("cashRegisterId") WHERE "status" = 'OPEN';

-- Row Level Security: mismo patrón que el resto de las tablas tenant-scoped
-- (ver prisma/migrations/..._enable_row_level_security).
ALTER TABLE "CashRegister" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CashRegister" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CashRegister"
  USING ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "CashShift" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CashShift" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CashShift"
  USING ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "CashMovement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CashMovement" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CashMovement"
  USING ("tenantId" = current_setting('app.tenant_id', true));

