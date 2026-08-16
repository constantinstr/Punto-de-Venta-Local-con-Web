-- Row Level Security: segunda capa de aislamiento multi-tenant (defensa en
-- profundidad además del filtro tenantId aplicado en cada query de Prisma).
-- Ver docs/ARCHITECTURE.md §2.
--
-- FORCE ROW LEVEL SECURITY es necesario porque la app se conecta como el
-- rol dueño de las tablas ("pos"), y Postgres exime al dueño de las
-- políticas de RLS por defecto.
--
-- La app debe setear `app.tenant_id` por transacción (ver
-- packages/database/src/tenant-context.ts) antes de correr cualquier query
-- sobre estas tablas. Si no está seteado, current_setting(..., true)
-- devuelve NULL y la política deniega todas las filas (fail-closed).

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "User"
  USING ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "Store" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Store" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Store"
  USING ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "Category" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Category" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Category"
  USING ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "Product" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Product" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Product"
  USING ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "Customer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Customer" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Customer"
  USING ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "Order" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Order" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Order"
  USING ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "SyncQueue" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SyncQueue" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SyncQueue"
  USING ("tenantId" = current_setting('app.tenant_id', true));

-- Las tablas hijas (OrderItem, Payment, StoreStock, ProductVariant,
-- BundleItem, CashRegister/Shift/Movement, Invoice, AfipCredential,
-- WooCommerceConfig) no tienen tenantId propio y heredan aislamiento vía
-- FK a una tabla ya protegida. RLS por cascada (policy con subquery al
-- padre) queda para el endurecimiento de Sprint 9 — ver docs/ROADMAP.md.
