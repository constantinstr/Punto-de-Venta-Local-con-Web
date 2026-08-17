import type { CartItem, Discount } from "@/stores/cart-types";
import { itemExceedsStock, lineDiscountAmount } from "@/stores/cart-calculations";

function money(n: number): string {
  return `$${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function CartTable({
  items,
  selectedLineId,
  maxDiscountPercent,
  discountEditorLineId,
  onSelectLine,
  onIncrement,
  onSetQuantity,
  onSetLineDiscount,
  onOpenDiscountEditor,
  onRemove,
}: {
  items: CartItem[];
  selectedLineId: string | null;
  /** Tope del rol que está vendiendo; null = sin tope. */
  maxDiscountPercent: number | null;
  /** Línea cuyo editor de descuento está abierto (lo abre F6 o el botón). */
  discountEditorLineId: string | null;
  onSelectLine: (lineId: string) => void;
  onIncrement: (lineId: string, delta: number) => void;
  onSetQuantity: (lineId: string, quantity: number) => void;
  onSetLineDiscount: (lineId: string, discount: Discount | undefined) => void;
  onOpenDiscountEditor: (lineId: string | null) => void;
  onRemove: (lineId: string) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted">
        Carrito vacío — escaneá o buscá un producto.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-muted  ">
            <th className="py-1.5">Producto</th>
            <th className="py-1.5 text-right">Cant.</th>
            <th className="py-1.5 text-right">Precio</th>
            <th className="py-1.5 text-right">Subtotal</th>
            <th className="py-1.5"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const exceeds = itemExceedsStock(item);
            const selected = item.lineId === selectedLineId;
            const gross = item.unitPrice * item.quantity;
            const discount = lineDiscountAmount(item);
            const net = gross - discount;
            const editing = item.lineId === discountEditorLineId;

            return (
              <tr
                key={item.lineId}
                onClick={() => onSelectLine(item.lineId)}
                className={`cursor-pointer border-b border-border align-top ${
                  selected ? "bg-accent-muted" : ""
                } ${exceeds ? "text-red-600" : ""}`}
              >
                <td className="py-1.5">
                  <div className="font-medium">{item.name}</div>
                  {item.attributesLabel && (
                    <div className="text-xs text-muted">{item.attributesLabel}</div>
                  )}

                  {/* Qué trae el combo: es la pregunta que le hacen al cajero
                      todo el tiempo, y hasta ahora había que salir a buscarla
                      al catálogo. */}
                  {item.isBundle && item.bundleComponents?.length ? (
                    <div className="mt-0.5 text-xs text-muted">
                      Contiene:{" "}
                      {item.bundleComponents
                        .map((c) => `${c.name} ×${c.quantity}`)
                        .join(", ")}
                    </div>
                  ) : null}

                  {exceeds && (
                    <div className="text-xs">
                      Supera stock disponible ({item.stockAvailable})
                    </div>
                  )}

                  {editing ? (
                    <DiscountEditor
                      discount={item.discount}
                      maxDiscountPercent={maxDiscountPercent}
                      gross={gross}
                      onChange={(d) => onSetLineDiscount(item.lineId, d)}
                      onClose={() => onOpenDiscountEditor(null)}
                    />
                  ) : (
                    /* Con tope 0 no se ofrece el control: un botón que
                       siempre termina en error es peor que no tenerlo. */
                    maxDiscountPercent !== 0 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectLine(item.lineId);
                          onOpenDiscountEditor(item.lineId);
                        }}
                        className={`mt-0.5 rounded px-1.5 py-0.5 text-xs ${
                          discount > 0
                            ? "bg-accent text-accent-foreground"
                            : "text-muted underline decoration-dotted"
                        }`}
                      >
                        {discount > 0
                          ? item.discount?.type === "PERCENTAGE"
                            ? `−${item.discount.value}%`
                            : `−${money(discount)}`
                          : "Descuento (F6)"}
                      </button>
                    )
                  )}
                </td>

                <td className="py-1.5 text-right">
                  <div className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onIncrement(item.lineId, -1);
                      }}
                      className="h-6 w-6 rounded border border-border  "
                    >
                      −
                    </button>
                    <input
                      type="number"
                      value={item.quantity}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => onSetQuantity(item.lineId, Number(e.target.value))}
                      className="w-12 rounded border border-border text-center   bg-surface"
                    />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onIncrement(item.lineId, 1);
                      }}
                      className="h-6 w-6 rounded border border-border  "
                    >
                      +
                    </button>
                  </div>
                </td>

                <td className="py-1.5 text-right tabular-nums">
                  {money(item.unitPrice)}
                </td>

                {/* Antes mostraba siempre unitPrice × cantidad, ignorando el
                    descuento: con descuentos de línea eso sería mentira. */}
                <td className="py-1.5 text-right font-medium tabular-nums">
                  {discount > 0 && (
                    <div className="text-xs font-normal text-muted line-through">
                      {money(gross)}
                    </div>
                  )}
                  {money(net)}
                </td>

                <td className="py-1.5 text-right">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(item.lineId);
                    }}
                    className="text-red-600"
                    aria-label={`Quitar ${item.name}`}
                  >
                    ×
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DiscountEditor({
  discount,
  maxDiscountPercent,
  gross,
  onChange,
  onClose,
}: {
  discount: Discount | undefined;
  maxDiscountPercent: number | null;
  gross: number;
  onChange: (discount: Discount | undefined) => void;
  onClose: () => void;
}) {
  const type = discount?.type ?? "PERCENTAGE";

  // El tope está en porcentaje, así que un descuento en pesos hay que
  // traducirlo antes de compararlo. El backend hace exactamente la misma
  // cuenta (ver OrdersService.assertDiscountWithinLimit): acá solo se
  // adelanta el aviso para no dejar cargar algo que va a ser rechazado.
  const currentPercent =
    discount && gross > 0
      ? discount.type === "PERCENTAGE"
        ? discount.value
        : (discount.value / gross) * 100
      : 0;
  const overLimit =
    maxDiscountPercent !== null && currentPercent > maxDiscountPercent;

  function emit(nextType: Discount["type"], rawValue: string) {
    if (rawValue === "") {
      onChange(undefined);
      return;
    }
    onChange({ type: nextType, value: Math.max(0, Number(rawValue)) });
  }

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="mt-1 flex flex-wrap items-center gap-1"
    >
      <input
        type="number"
        min={0}
        autoFocus
        data-no-scan
        placeholder="0"
        value={discount?.value ?? ""}
        onChange={(e) => emit(type, e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "Escape") {
            e.stopPropagation();
            onClose();
          }
        }}
        className="w-16 rounded border border-border bg-surface px-1 py-0.5 text-right text-xs"
      />
      <select
        value={type}
        onChange={(e) => emit(e.target.value as Discount["type"], String(discount?.value ?? ""))}
        className="rounded border border-border bg-surface px-1 py-0.5 text-xs"
      >
        <option value="PERCENTAGE">%</option>
        <option value="FIXED">$</option>
      </select>
      <button
        type="button"
        onClick={() => {
          onChange(undefined);
          onClose();
        }}
        className="px-1 text-xs text-muted underline"
      >
        Quitar
      </button>
      <button type="button" onClick={onClose} className="px-1 text-xs text-accent">
        Listo
      </button>

      {overLimit && (
        <p className="w-full text-xs text-danger">
          {maxDiscountPercent === 0
            ? "Tu rol no puede aplicar descuentos."
            : `Tu rol puede descontar hasta ${maxDiscountPercent}%.`}{" "}
          Pedile a un encargado que lo autorice.
        </p>
      )}
    </div>
  );
}
