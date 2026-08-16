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
  onSetGlobalDiscount,
  onCheckout,
  checkoutDisabled,
}: {
  totals: CartTotals;
  globalDiscount?: Discount;
  onSetGlobalDiscount: (discount: Discount | undefined) => void;
  onCheckout: () => void;
  checkoutDisabled: boolean;
}) {
  return (
    <div className="space-y-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
      <div className="flex justify-between text-sm text-zinc-500">
        <span>Subtotal</span>
        <span>${totals.subtotalBruto.toLocaleString("es-AR")}</span>
      </div>

      <div className="flex items-center justify-between text-sm text-zinc-500">
        <label className="flex items-center gap-2">
          Descuento global
          <input
            type="number"
            min={0}
            placeholder="0"
            value={globalDiscount?.value ?? ""}
            onChange={(e) => {
              const value = e.target.value === "" ? undefined : Number(e.target.value);
              onSetGlobalDiscount(value === undefined ? undefined : { type: globalDiscount?.type ?? "FIXED", value });
            }}
            className="w-20 rounded border border-zinc-300 px-2 py-0.5 text-right dark:border-zinc-700 dark:bg-zinc-900"
          />
          <select
            value={globalDiscount?.type ?? "FIXED"}
            onChange={(e) =>
              onSetGlobalDiscount(
                globalDiscount?.value ? { type: e.target.value as "FIXED" | "PERCENTAGE", value: globalDiscount.value } : undefined,
              )
            }
            className="rounded border border-zinc-300 px-1 py-0.5 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="FIXED">$</option>
            <option value="PERCENTAGE">%</option>
          </select>
        </label>
        <span>-${totals.totalDiscount.toLocaleString("es-AR")}</span>
      </div>

      <div className="space-y-1 text-xs text-zinc-400">
        {totals.vatBreakdown.map((v) => (
          <div key={v.condition} className="flex justify-between">
            <span>{VAT_LABELS[v.condition]}</span>
            <span>${v.vat.toLocaleString("es-AR")}</span>
          </div>
        ))}
      </div>

      <div className="flex items-baseline justify-between border-t border-zinc-200 pt-3 dark:border-zinc-800">
        <span className="text-sm font-medium text-zinc-500">Total</span>
        <span className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">
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
