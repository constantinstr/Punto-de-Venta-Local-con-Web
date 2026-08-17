-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EnforcementPolicy" AS ENUM ('WARN_ONLY', 'READ_ONLY', 'BLOCK');

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN "subscriptionStatus" "SubscriptionStatus" NOT NULL DEFAULT 'TRIAL';
ALTER TABLE "Tenant" ADD COLUMN "trialEndsAt" TIMESTAMP(3);
ALTER TABLE "Tenant" ADD COLUMN "currentPeriodEnd" TIMESTAMP(3);
ALTER TABLE "Tenant" ADD COLUMN "mpPreapprovalId" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "enforcementPolicy" "EnforcementPolicy" NOT NULL DEFAULT 'WARN_ONLY';
ALTER TABLE "Tenant" ADD COLUMN "monthlyAmount" DECIMAL(12,2);
ALTER TABLE "Tenant" ADD COLUMN "contactEmail" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_mpPreapprovalId_key" ON "Tenant"("mpPreapprovalId");

-- CreateTable
CREATE TABLE "SubscriptionEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "amount" DECIMAL(12,2),
    "mpPaymentId" TEXT,
    "periodEnd" TIMESTAMP(3),
    "notes" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- Esta restricción ES la idempotencia del webhook de Mercado Pago: MP
-- reintenta las notificaciones, y sin esto un mismo pago extendería
-- currentPeriodEnd dos veces. El P2002 del segundo intento se atrapa y se
-- ignora (ver SubscriptionService.applyPayment).
CREATE UNIQUE INDEX "SubscriptionEvent_mpPaymentId_key" ON "SubscriptionEvent"("mpPaymentId");

-- CreateIndex
CREATE INDEX "SubscriptionEvent_tenantId_createdAt_idx" ON "SubscriptionEvent"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "SubscriptionEvent" ADD CONSTRAINT "SubscriptionEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RowLevelSecurity
ALTER TABLE "SubscriptionEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SubscriptionEvent" FORCE ROW LEVEL SECURITY;

-- El panel de plataforma (rol SUPERADMIN, que por definición no tiene
-- tenantId) necesita leer TODOS los tenants y su historial de pagos. Se
-- agrega un escape hatch propio, `app.platform_admin`, seteado únicamente
-- por withPlatformContext() — ver packages/database/src/tenant-context.ts.
--
-- Deliberadamente NO se reutiliza `app.bypass_tenant_rls` (el del login, ver
-- 20260816020721_refine_user_rls_for_login): son privilegios distintos y
-- separarlos acota el radio de daño de un bug en cualquiera de los dos. Con
-- esta separación, el contexto de login NO puede leer tenants ajenos, y el
-- contexto de plataforma NO puede leer la tabla "User" (que guarda
-- passwordHash) — su RLS queda intacta a propósito.
CREATE POLICY tenant_isolation ON "SubscriptionEvent"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.platform_admin', true) = 'true'
  );

ALTER POLICY tenant_isolation ON "Tenant"
  USING (
    "id" = current_setting('app.tenant_id', true)
    OR current_setting('app.platform_admin', true) = 'true'
  );
