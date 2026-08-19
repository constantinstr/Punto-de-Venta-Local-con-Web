import type { Metadata } from "next";

// Mismo motivo que login/layout.tsx: page.tsx es "use client", metadata tiene que
// vivir en un Server Component. El POS de mostrador es la pantalla privada por
// excelencia — no tiene ningún sentido que aparezca en resultados de búsqueda.
export const metadata: Metadata = {
  title: "Punto de venta",
  robots: { index: false, follow: false },
};

export default function PosLayout({ children }: { children: React.ReactNode }) {
  return children;
}
