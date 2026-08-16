-- El login busca al usuario por email antes de saber a qué tenant
-- pertenece (no hay forma de conocer tenantId de antemano), así que la
-- política original bloqueaba SIEMPRE esa búsqueda bajo FORCE ROW LEVEL
-- SECURITY. Se agrega un escape hatch explícito y acotado, seteado
-- únicamente por withAuthLookupContext() en el módulo de auth.
-- Ver packages/database/src/tenant-context.ts.

ALTER POLICY tenant_isolation ON "User"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.bypass_tenant_rls', true) = 'true'
  );
