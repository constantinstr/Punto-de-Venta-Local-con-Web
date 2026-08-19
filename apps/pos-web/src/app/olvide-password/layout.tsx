import type { Metadata } from "next";

// Mismo motivo que login/layout.tsx: page.tsx es "use client", así que el
// metadata tiene que vivir en este wrapper Server Component.
export const metadata: Metadata = {
  title: "Recuperar contraseña",
  robots: { index: false, follow: false },
};

export default function OlvidePasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
