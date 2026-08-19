import type { Metadata } from "next";

// Mismo motivo que login/layout.tsx: page.tsx es "use client", metadata tiene que
// vivir en un Server Component.
export const metadata: Metadata = {
  title: "Registrar mi comercio",
  robots: { index: false, follow: false },
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
