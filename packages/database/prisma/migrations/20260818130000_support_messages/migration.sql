-- CreateEnum
CREATE TYPE "SupportMessageCategory" AS ENUM ('TECHNICAL', 'PREMIUM_INTEREST');

-- CreateEnum
CREATE TYPE "SupportMessageStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateTable
CREATE TABLE "SupportMessage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "userId" TEXT,
    "contactName" TEXT,
    "contactEmail" TEXT NOT NULL,
    "category" "SupportMessageCategory" NOT NULL,
    "subject" TEXT,
    "message" TEXT NOT NULL,
    "status" "SupportMessageStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupportMessage_status_createdAt_idx" ON "SupportMessage"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SupportMessage_tenantId_idx" ON "SupportMessage"("tenantId");

-- AddForeignKey
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
