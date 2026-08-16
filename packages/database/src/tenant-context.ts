import { prisma } from "./client";
import type { Prisma } from "../generated/client";

export type TransactionClient = Prisma.TransactionClient;

// Corre `fn` dentro de una transacción con `app.tenant_id` seteado como
// variable de sesión, para que las políticas RLS (ver prisma/migrations/
// ..._enable_row_level_security) filtren las filas del tenant correcto.
// Es la segunda capa de aislamiento; el filtro `tenantId` explícito en cada
// query de Prisma sigue siendo obligatorio y es la primera línea de defensa.
export async function withTenantContext<T>(
  tenantId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    return fn(tx);
  });
}

// Único escape hatch a la RLS de "User", usado exclusivamente por el login
// (buscar por email antes de saber a qué tenant pertenece esa persona — no
// hay forma de conocer tenantId de antemano). Ver la política de RLS en
// prisma/migrations/..._refine_user_rls_for_login. No usar para nada más.
export async function withAuthLookupContext<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_tenant_rls', 'true', true)`;
    return fn(tx);
  });
}
