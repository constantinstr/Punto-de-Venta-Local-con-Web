import type { CartTotals } from "@/stores/cart-calculations";
import type { Discount } from "@/stores/cart-types";

const VAT_LABELS: Record<string, string> = {
  IVA_21: "IVA 21%",
  IVA_10_5: "IVA 10.5%",
  IVA_0: "IVA 0%",
  EXENTO: "Exento",
  NO_GRAVADO: "No gravado",
};

export function CartSummary({
  totals,
  globalDiscount,
  maxDiscountPercent,
  onSetGlobalDiscount,
  onCheckout,
  checkoutDisabled,
}: {
  totals: CartTotals;
  globalDiscount?: Discount;
  /** Tope del rol que está vendiendo; null = sin tope configurado. */
  maxDiscountPercent: number | null;
  onSetGlobalDiscount: (discount: Discount | undefined) => void;
  onCheckout: () => void;
  checkoutDisabled: boolean;
}) {
  return (
    <div className="space-y-3 border-t border-border pt-3  ">
      <div className="flex justify-between text-sm text-muted">
        <span>Subtotal</span>
        <span>${totals.subtotalBruto.toLocaleString("es-AR")}</span>
      </div>

      {/* Fila propia para los descuentos de línea: antes la de abajo decía
          "Descuento global" pero mostraba totals.totalDiscount, que incluye
          los dos. Con descuentos por línea habilitados eso sería directamente
          un número equivocado. */}
      {totals.lineDiscountsTotal > 0 && (
        <div className="flex justify-between text-sm text-muted">
          <span>Descuentos por producto</span>
          <span>-${totals.lineDiscountsTotal.toLocaleString("es-AR")}</span>
        </div>
      )}

      <div className="flex items-center justify-between text-sm text-muted">
        <label className="flex items-center gap-2">
          Descuento global
          <input
            type="number"
            min={0}
            placeholder="0"
            // Con tope 0 el campo queda inerte: cargarlo solo lograría que la
            // venta se rechace al cobrar, con el cliente esperando.
            disabled={maxDiscountPercent === 0}
            value={globalDiscount?.value ?? ""}
            onChange={(e) => {
              const value = e.target.value === "" ? undefined : Number(e.target.value);
              onSetGlobalDiscount(value === undefined ? undefined : { type: globalDiscount?.type ?? "FIXED", value });
            }}
            className="w-20 rounded border border-border px-2 py-0.5 text-right bg-surface disabled:opacity-50"
          />
          <select
            disabled={maxDiscountPercent === 0}
            value={globalDiscount?.type ?? "FIXED"}
            onChange={(e) =>
              onSetGlobalDiscount(
                globalDiscount?.value ? { type: e.target.value as "FIXED" | "PERCENTAGE", value: globalDiscount.value } : undefined,
              )
            }
            className="rounded border border-border px-1 py-0.5   bg-surface"
          >
            <option value="FIXED">$</option>
            <option value="PERCENTAGE">%</option>
          </select>
        </label>
        <span>-${totals.globalDiscountAmount.toLocaleString("es-AR")}</span>
      </div>

      {maxDiscountPercent !== null && (
        <p className="text-xs text-muted">
          {maxDiscountPercent === 0
            ? "Tu rol no puede aplicar descuentos. Pedile a un encargado que los autorice."
            : `Tu rol puede descontar hasta ${maxDiscountPercent}% por producto y sobre el total.`}
        </p>
      )}

      <div className="space-y-1 text-xs text-muted">
        {totals.vatBreakdown.map((v) => (
          <div key={v.condition} className="flex justify-between">
            <span>{VAT_LABELS[v.condition]}</span>
            <span>${v.vat.toLocaleString("es-AR")}</span>
          </div>
        ))}
      </div>

      <div className="flex items-baseline justify-between border-t border-border pt-3  ">
        <span className="text-sm font-medium text-muted">Total</span>
        <span className="text-3xl font-bold text-foreground  ">
          ${totals.total.toLocaleString("es-AR")}
        </span>
      </div>

      <button
        type="button"
        onClick={onCheckout}
        disabled={checkoutDisabled}
        className="w-full rounded-lg bg-green-600 py-3 text-lg font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        Cobrar (F9)
      </button>
    </div>
  );
}
