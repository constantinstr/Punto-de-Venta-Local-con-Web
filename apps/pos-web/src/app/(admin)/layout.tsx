import { AppShell } from "@/components/layout/AppShell";

// Route group — no cambia ninguna URL (/catalog, /stock, /reports,
// /settings/... siguen siendo las mismas rutas), solo separa el bundle de
// administración del bundle del POS (apps/pos-web/src/app/pos no está acá
// a propósito: es pantalla completa, sin sidebar — ver docs/ARCHITECTURE.md
// §6, "el POS no debe cargar JS de reportes/admin").
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
