// Tipos compartidos entre apps/api y apps/pos-web.
// Se van a ir poblando sprint a sprint (catálogo, venta, caja) a medida que
// se implementen los módulos correspondientes — ver docs/ROADMAP.md.

export interface ApiErrorResponse {
  statusCode: number;
  message: string;
  error?: string;
}

// Espejo del enum UserRole de prisma/schema.prisma. Se redefine acá (en vez
// de importar @pos/database) para que pos-web no dependa del paquete que
// trae el motor nativo de Prisma.
export type UserRole = "SUPERADMIN" | "OWNER" | "ADMIN" | "MANAGER" | "CASHIER";

export interface AuthUser {
  id: string;
  tenantId: string | null;
  email: string;
  fullName: string;
  role: UserRole;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}
