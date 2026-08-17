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

// Contexto del staff del SaaS (rol SUPERADMIN, que por definición no tiene
// tenantId): habilita leer/escribir TODOS los tenants y su historial de
// suscripción, para el panel de plataforma.
//
// Usa una variable de sesión PROPIA (`app.platform_admin`) en vez de
// reutilizar la de withAuthLookupContext, y solo dos tablas la honran:
// "Tenant" y "SubscriptionEvent" (ver migración ..._subscriptions). La
// consecuencia buscada es que este contexto NO puede leer "User" —donde vive
// passwordHash—, y que el de login no puede leer tenants ajenos: un bug en
// cualquiera de los dos no alcanza al otro.
//
// Solo debe usarse detrás de endpoints con @Roles(SUPERADMIN).
export async function withPlatformContext<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.platform_admin', 'true', true)`;
    return fn(tx);
  });
}
