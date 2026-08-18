import Link from "next/link";
import { DemoCta } from "@/components/marketing/DemoCta";

// Landing pública en "/" — antes acá vivía el dashboard autenticado
// (movido a /inicio, ver AppShell y NAV_ITEMS). Server component: sin
// "use client" acá arriba, solo DemoCta necesita el cliente (auth store +
// mutation), así que es el único fragmento que paga ese costo.
//
// Deliberadamente sin imágenes ni fuentes externas — mismo criterio "ultra
// liviano" que el resto de la PWA (ver docs/ARCHITECTURE.md).
const FEATURES = [
  { title: "Punto de venta", body: "Vendé en mostrador, con o sin conexión — el carrito no se pierde." },
  { title: "Caja", body: "Apertura y cierre de turno, arqueo y movimientos de efectivo." },
  { title: "Stock", body: "Productos simples, variables y combos, con alertas de stock bajo." },
  { title: "Clientes", body: "Cuenta corriente, límite de crédito y presupuestos." },
  { title: "Reportes", body: "Ventas, márgenes y stock bajo por local y por período." },
  { title: "Compras", body: "Alta de proveedores y actualización de costos por compra." },
];

const PLAN_ROWS: { feature: string; demo: string; pago: string }[] = [
  { feature: "Ventas, caja, stock, clientes, reportes, compras", demo: "Incluido", pago: "Incluido" },
  { feature: "Productos en el catálogo", demo: "Hasta 20", pago: "Sin límite" },
  { feature: "Locales", demo: "1", pago: "Sin límite" },
  { feature: "Facturación electrónica AFIP", demo: "—", pago: "Incluido" },
  { feature: "Sincronización con WooCommerce / Tienda Nube", demo: "—", pago: "Incluido" },
  { feature: "Duración", demo: "7 días, se borra sola", pago: "Mientras esté activa la suscripción" },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background font-sans text-foreground">
      <header className="flex items-center justify-between px-6 py-4">
        <span className="font-semibold">POS SaaS</span>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/login" className="hover:underline">
            Iniciar sesión
          </Link>
          <Link href="/register" className="rounded border border-border px-3 py-1.5 hover:border-border-strong">
            Registrar mi comercio
          </Link>
        </nav>
      </header>

      <section className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-6 py-16 text-center">
        <h1 className="text-3xl font-semibold sm:text-4xl">
          El punto de venta para tu comercio, sin instalar nada
        </h1>
        <p className="max-w-xl text-muted">
          Mostrador, caja, stock, clientes y reportes en una sola app web.
          Facturación electrónica AFIP y sincronización con WooCommerce y
          Tienda Nube cuando lo necesites.
        </p>
        <DemoCta />
      </section>

      <section className="mx-auto max-w-4xl px-6 py-10">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-lg border border-border bg-surface p-4">
              <h2 className="font-medium">{f.title}</h2>
              <p className="mt-1 text-sm text-muted">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 py-10">
        <h2 className="mb-4 text-center text-xl font-medium">Qué incluye la demo</h2>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-muted text-muted">
                <th className="px-4 py-2 font-medium">Función</th>
                <th className="px-4 py-2 font-medium">Demo</th>
                <th className="px-4 py-2 font-medium">Plan pago</th>
              </tr>
            </thead>
            <tbody>
              {PLAN_ROWS.map((row) => (
                <tr key={row.feature} className="border-b border-border last:border-0">
                  <td className="px-4 py-2">{row.feature}</td>
                  <td className="px-4 py-2 text-muted">{row.demo}</td>
                  <td className="px-4 py-2 text-muted">{row.pago}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="px-6 py-8 text-center text-xs text-muted">
        <p>
          ¿Ya tenés cuenta? <Link href="/login" className="underline">Iniciá sesión</Link>.
        </p>
      </footer>
    </div>
  );
}
