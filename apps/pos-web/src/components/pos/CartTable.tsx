import type { CartItem } from "@/stores/cart-types";
import { itemExceedsStock } from "@/stores/cart-calculations";

export function CartTable({
  items,
  selectedLineId,
  onSelectLine,
  onIncrement,
  onSetQuantity,
  onRemove,
}: {
  items: CartItem[];
  selectedLineId: string | null;
  onSelectLine: (lineId: string) => void;
  onIncrement: (lineId: string, delta: number) => void;
  onSetQuantity: (lineId: string, quantity: number) => void;
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
            return (
              <tr
                key={item.lineId}
                onClick={() => onSelectLine(item.lineId)}
                className={`cursor-pointer border-b border-border   ${
                  selected ? "bg-accent-muted" : ""
                } ${exceeds ? "text-red-600" : ""}`}
              >
                <td className="py-1.5">
                  <div className="font-medium">{item.name}</div>
                  {item.attributesLabel && <div className="text-xs text-muted">{item.attributesLabel}</div>}
                  {exceeds && <div className="text-xs">Supera stock disponible ({item.stockAvailable})</div>}
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
                <td className="py-1.5 text-right">${item.unitPrice.toLocaleString("es-AR")}</td>
                <td className="py-1.5 text-right font-medium">
                  ${(item.unitPrice * item.quantity).toLocaleString("es-AR")}
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
