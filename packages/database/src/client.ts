import { PrismaClient } from "../generated/client";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

// Reusar la instancia en dev (hot-reload de Next.js/Nest) para no agotar
// el pool de conexiones de Postgres abriendo un PrismaClient por reload.
export const prisma = globalThis.__prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}
