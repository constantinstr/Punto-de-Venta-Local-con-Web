-- Sprint 9: hardening de seguridad.

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "isRevoked" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Auditoría RLS (Sprint 9): "Tenant" era la única tabla raíz sin su propia
-- política — cualquier query sin filtro explícito de tenantId podía listar
-- nombre/slug de TODOS los tenants. Se cierra ese hueco acá.
--
-- A diferencia del resto de las tablas, "Tenant" no tiene una columna
-- tenantId separada — es SU PROPIO id el límite. Eso hace que el INSERT de
-- alta de tenant (AuthService.registerTenant) necesite pre-generar el id
-- ANTES del insert y setear app.tenant_id a ese valor antes de crear la
-- fila (ver el cambio en auth.service.ts) — si no, WITH CHECK rechaza el
-- INSERT porque, al crear un tenant nuevo, la sesión todavía no tiene
-- ningún app.tenant_id seteado.
ALTER TABLE "Tenant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Tenant" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Tenant"
  USING ("id" = current_setting('app.tenant_id', true));
