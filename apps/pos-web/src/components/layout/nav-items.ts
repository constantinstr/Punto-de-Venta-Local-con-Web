import type { UserRole } from "@pos/shared-types";

export interface NavItem {
  href: string;
  label: string;
  // Sin esta lista, cualquier rol ve el link y solo descubre que no puede
  // entrar al pisar un 403 del backend — se espeja contra los @Roles reales
  // de cada controller (ver comentario en cada item).
  roles: UserRole[];
}

const ALL_STAFF: UserRole[] = ["OWNER", "ADMIN", "MANAGER", "CASHIER"];
const BACK_OFFICE: UserRole[] = ["OWNER", "ADMIN", "MANAGER"];
const OWNER_ADMIN: UserRole[] = ["OWNER", "ADMIN"];

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Inicio", roles: ALL_STAFF },
  { href: "/pos", label: "Punto de venta", roles: ALL_STAFF },
  { href: "/sales", label: "Ventas", roles: BACK_OFFICE },
  // catalog/stock: POST /products, POST /stock/adjust son OWNER/ADMIN/MANAGER.
  { href: "/catalog", label: "Catálogo", roles: BACK_OFFICE },
  { href: "/stock", label: "Stock", roles: BACK_OFFICE },
  { href: "/purchases", label: "Compras", roles: BACK_OFFICE },
  { href: "/customers", label: "Clientes", roles: BACK_OFFICE },
  // reports: ReportsPage ya se auto-restringe a OWNER/ADMIN (ver canView).
  { href: "/reports", label: "Reportes", roles: OWNER_ADMIN },
  { href: "/settings", label: "Configuración", roles: BACK_OFFICE },
  // Panel del staff del SaaS (gestión de comercios y suscripciones). Es el
  // único ítem que un OWNER no ve nunca — ver PlatformController.
  { href: "/platform", label: "Comercios", roles: ["SUPERADMIN"] },
];
