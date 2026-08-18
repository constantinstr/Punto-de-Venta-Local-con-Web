-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "demoExpiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Tenant_planTier_demoExpiresAt_idx" ON "Tenant"("planTier", "demoExpiresAt");
