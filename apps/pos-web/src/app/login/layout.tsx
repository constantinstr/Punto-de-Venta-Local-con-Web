import type { Metadata } from "next";

// page.tsx de esta ruta es "use client" (formulario de login), y Next solo permite
// exportar `metadata` desde Server Components — de ahí este layout mínimo, que no
// hace nada más que pasar los children y marcar la ruta como no indexable (además del
// bloqueo en robots.ts — doble cinturón para que el login nunca aparezca en buscadores).
export const metadata: Metadata = {
  title: "Iniciar sesión",
  robots: { index: false, follow: false },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
