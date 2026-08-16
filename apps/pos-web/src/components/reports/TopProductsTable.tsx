import type { TopProductEntry } from "@pos/shared-types";
import { formatMoney } from "@/lib/report-formatters";

// Badge de margen: nunca solo color — siempre acompañado del signo/monto en
// texto (ver skill dataviz, regla de status colors). Verde/rojo son los
// pasos "good"/"critical" de la paleta de estado, reservados y no reciclados
// como color de serie en ningún otro gráfico de esta página.
function MarginBadge({ margin }: { margin: number }) {
  const positive = margin >= 0;
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
        positive
          ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
          : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
      }`}
    >
      {positive ? "+" : ""}
      {formatMoney(margin)}
    </span>
  );
}

export function TopProductsTable({ products }: { products: TopProductEntry[] }) {
  if (products.length === 0) {
    return <p className="py-8 text-center text-sm text-zinc-400">Sin ventas de productos en el período.</p>;
  }

  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
          <th className="py-2">#</th>
          <th className="py-2">Producto</th>
          <th className="py-2 text-right">Unidades</th>
          <th className="py-2 text-right">Mostrador</th>
          <th className="py-2 text-right">Online</th>
          <th className="py-2 text-right">Facturación</th>
          <th className="py-2 text-right">Margen</th>
        </tr>
      </thead>
      <tbody>
        {products.map((p, i) => (
          <tr key={`${p.productId}:${p.variantId ?? ""}`} className="border-b border-zinc-100 dark:border-zinc-900">
            <td className="py-2 text-zinc-400">{i + 1}</td>
            <td className="py-2">
              {p.name}
              <span className="ml-1.5 font-mono text-xs text-zinc-400">{p.sku}</span>
            </td>
            <td className="py-2 text-right">{p.unitsSold}</td>
            <td className="py-2 text-right text-zinc-500">{p.posUnits}</td>
            <td className="py-2 text-right text-zinc-500">{p.onlineUnits}</td>
            <td className="py-2 text-right">{formatMoney(p.revenue)}</td>
            <td className="py-2 text-right">
              <MarginBadge margin={p.margin} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
