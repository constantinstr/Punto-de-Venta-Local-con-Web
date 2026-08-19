import type { Metadata } from "next";

// Un solo layout para todo el grupo de rutas (admin) — inicio, catalog, customers,
// purchases, quotes, reports, sales, settings, stock, platform — cubre a todas de
// una sola vez porque comparten este segmento de ruta. Todas sus page.tsx son
// "use client", así que metadata tiene que vivir acá (Server Component).
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
