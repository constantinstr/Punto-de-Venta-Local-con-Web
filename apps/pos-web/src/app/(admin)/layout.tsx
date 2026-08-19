import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";

// Un solo layout para todo el grupo de rutas (admin) — inicio, catalog, customers,
// purchases, quotes, reports, sales, settings, stock, platform — cubre a todas de
// una sola vez porque comparten este segmento de ruta. Todas sus page.tsx son
// "use client", así que metadata tiene que vivir acá (Server Component).
//
// HOTFIX: este archivo antes solo devolvía `children` sin envolver en <AppShell> —
// se rompió sin querer al agregar el `metadata` de acá abajo (el archivo original
// hacía `return <AppShell>{children}</AppShell>`, se perdió en el mismo commit que
// agregó el noindex). Sin AppShell no hay sidebar, ni DemoBanner/SubscriptionBanner,
// ni DemoExpiredGate en ninguna pantalla de (admin) — ver commit bc692eb.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
