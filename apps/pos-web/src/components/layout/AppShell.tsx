"use client";

import { useAuthStore } from "@/lib/auth-store";
import { NavSidebar } from "./NavSidebar";
import { SubscriptionBanner } from "./SubscriptionBanner";
import { DemoBanner } from "./DemoBanner";
import { DemoExpiredGate } from "@/components/common/DemoExpiredGate";

// No usa useRequireAuth: cada página adentro ya hace su propio chequeo (lo
// necesita igual para leer `user.role` y decidir qué mostrar) — si acá
// hiciéramos un segundo redirect en paralelo, competirían entre sí. Este
// shell solo decide si hay sidebar para mostrar; la página resuelve login.
export function AppShell({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s.hasHydrated);

  if (!hasHydrated || !user) {
    return <div className="min-h-screen bg-background">{children}</div>;
  }

  return (
    <div className="flex min-h-screen bg-background">
      <NavSidebar user={user} />
      {/* El banner va adentro de la columna de contenido y no arriba de todo
          para no empujar el sidebar: aparece y desaparece según el estado de
          la suscripción, y no debería mover la navegación al hacerlo. */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <DemoBanner />
        <SubscriptionBanner />
        <main className="flex-1 overflow-y-auto">
          <DemoExpiredGate>{children}</DemoExpiredGate>
        </main>
      </div>
    </div>
  );
}
