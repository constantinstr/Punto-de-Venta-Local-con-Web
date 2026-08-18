-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "lastName" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "province" TEXT,
ADD COLUMN     "postalCode" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "whatsapp" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "Customer_tenantId_docNumber_idx" ON "Customer"("tenantId", "docNumber");

-- CreateIndex
CREATE INDEX "Customer_tenantId_name_idx" ON "Customer"("tenantId", "name");
