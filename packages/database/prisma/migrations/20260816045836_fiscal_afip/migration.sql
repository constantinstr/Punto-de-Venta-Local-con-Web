-- CreateEnum
CREATE TYPE "CustomerDocType" AS ENUM ('CUIT', 'DNI', 'PASAPORTE', 'FINAL_CONSUMER');

-- CreateEnum
CREATE TYPE "CustomerTaxCondition" AS ENUM ('CONSUMIDOR_FINAL', 'RESPONSABLE_INSCRIPTO', 'MONOTRIBUTO', 'EXENTO');

-- CreateEnum
CREATE TYPE "FiscalTaxCondition" AS ENUM ('MONOTRIBUTO', 'RESPONSABLE_INSCRIPTO', 'EXENTO');

-- AlterEnum
BEGIN;
CREATE TYPE "InvoiceStatus_new" AS ENUM ('ISSUED', 'REJECTED', 'CANCELLED');
ALTER TABLE "public"."Invoice" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Invoice" ALTER COLUMN "status" TYPE "InvoiceStatus_new" USING ("status"::text::"InvoiceStatus_new");
ALTER TYPE "InvoiceStatus" RENAME TO "InvoiceStatus_old";
ALTER TYPE "InvoiceStatus_new" RENAME TO "InvoiceStatus";
DROP TYPE "public"."InvoiceStatus_old";
COMMIT;

-- AlterEnum
-- Prisma generó esto referenciando la columna "invoiceType", pero en este
-- punto de la migración la columna todavía se llama "type" (el rename a
-- "invoiceType" pasa más abajo, en el ALTER TABLE "Invoice"). Se corrige a
-- mano para que ALTER COLUMN apunte a la columna que realmente existe acá.
BEGIN;
CREATE TYPE "InvoiceType_new" AS ENUM ('FACTURA_A', 'FACTURA_B', 'FACTURA_C', 'NOTA_CREDITO_A', 'NOTA_CREDITO_B', 'NOTA_CREDITO_C', 'TICKET_X');
ALTER TABLE "Invoice" ALTER COLUMN "type" TYPE "InvoiceType_new" USING ("type"::text::"InvoiceType_new");
ALTER TYPE "InvoiceType" RENAME TO "InvoiceType_old";
ALTER TYPE "InvoiceType_new" RENAME TO "InvoiceType";
DROP TYPE "public"."InvoiceType_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "AfipCredential" DROP CONSTRAINT "AfipCredential_storeId_fkey";

-- AlterTable
ALTER TABLE "Customer" DROP COLUMN "fiscalCondition",
ADD COLUMN     "address" TEXT,
ADD COLUMN     "businessName" TEXT,
ADD COLUMN     "taxCondition" "CustomerTaxCondition" NOT NULL DEFAULT 'CONSUMIDOR_FINAL',
DROP COLUMN "docType",
ADD COLUMN     "docType" "CustomerDocType" NOT NULL DEFAULT 'FINAL_CONSUMER';

-- AlterTable
ALTER TABLE "Invoice" DROP COLUMN "afipResponseRaw",
DROP COLUMN "caeExpirationDate",
DROP COLUMN "pointOfSale",
DROP COLUMN "qrData",
DROP COLUMN "type",
DROP COLUMN "voucherNumber",
ADD COLUMN     "afipQrUrl" TEXT,
ADD COLUMN     "afipResponse" JSONB,
ADD COLUMN     "caeVto" TIMESTAMP(3),
ADD COLUMN     "cbteNro" INTEGER,
ADD COLUMN     "customerId" TEXT,
ADD COLUMN     "invoiceType" "InvoiceType" NOT NULL,
ADD COLUMN     "ptoVta" INTEGER NOT NULL,
ADD COLUMN     "storeId" TEXT NOT NULL,
ADD COLUMN     "subtotalNeto" DECIMAL(12,2) NOT NULL,
ADD COLUMN     "tenantId" TEXT NOT NULL,
ADD COLUMN     "total" DECIMAL(12,2) NOT NULL,
ADD COLUMN     "vatAmount" DECIMAL(12,2) NOT NULL,
ALTER COLUMN "status" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Store" DROP COLUMN "afipPointOfSale";

-- DropTable
DROP TABLE "AfipCredential";

-- CreateTable
CREATE TABLE "FiscalConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "cuit" TEXT NOT NULL,
    "taxCondition" "FiscalTaxCondition" NOT NULL,
    "grossIncomeNumber" TEXT,
    "activityStartDate" TIMESTAMP(3),
    "ptoVta" INTEGER NOT NULL,
    "crtCertificate" TEXT NOT NULL,
    "keyCertificate" TEXT NOT NULL,
    "isProduction" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiscalConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FiscalConfig_storeId_key" ON "FiscalConfig"("storeId");

-- CreateIndex
CREATE INDEX "FiscalConfig_tenantId_idx" ON "FiscalConfig"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "FiscalConfig_tenantId_ptoVta_key" ON "FiscalConfig"("tenantId", "ptoVta");

-- CreateIndex
CREATE INDEX "Invoice_tenantId_idx" ON "Invoice"("tenantId");

-- CreateIndex
CREATE INDEX "Invoice_storeId_idx" ON "Invoice"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_storeId_invoiceType_cbteNro_key" ON "Invoice"("storeId", "invoiceType", "cbteNro");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalConfig" ADD CONSTRAINT "FiscalConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalConfig" ADD CONSTRAINT "FiscalConfig_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row Level Security: Invoice y FiscalConfig ahora tienen tenantId propio,
-- misma política que el resto (ver ..._enable_row_level_security). Customer
-- ya tenía RLS desde esa migración original.
ALTER TABLE "Invoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Invoice" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Invoice"
  USING ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "FiscalConfig" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FiscalConfig" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "FiscalConfig"
  USING ("tenantId" = current_setting('app.tenant_id', true));

