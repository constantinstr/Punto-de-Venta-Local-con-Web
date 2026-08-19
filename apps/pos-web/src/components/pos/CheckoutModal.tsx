"use client";

import { useEffect, useRef, useState } from "react";
import type { Order, PaymentMethod, RequestedInvoiceType, Invoice, Store, Customer } from "@pos/shared-types";
import type { CartTotals } from "@/stores/cart-calculations";
import type { OrderItemPayload } from "@/stores/cart-calculations";
import { sumPayments, remainingToPay, computeChange, validatePayments, type PaymentLine } from "@/stores/payment-calculations";
import { useCreateOrder } from "@/hooks/useOrders";
import { useQuote } from "@/hooks/useQuotes";
import { useFiscalConfig } from "@/hooks/useFiscalConfig";
import { useIssueInvoice } from "@/hooks/useInvoices";
import { usePlan } from "@/hooks/usePlan";
import { ApiError } from "@/lib/api";
import { ThermalReceipt, type ReceiptPaperSize } from "./ThermalReceipt";
import { CustomerPicker } from "./CustomerPicker";
import { PremiumBadge } from "@/components/common/PremiumBadge";
import { UpgradeModal } from "@/components/common/UpgradeModal";

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Efectivo",
  DEBIT_CARD: "Débito",
  CREDIT_CARD: "Crédito",
  TRANSFER: "Transferencia",
  MERCADO_PAGO: "Mercado Pago",
  CURRENT_ACCOUNT: "Cuenta corriente",
};

const FISCAL_OPTION_LABELS: Record<RequestedInvoiceType, string> = {
  TICKET_X: "Ticket (no fiscal)",
  FACTURA_B: "Factura B",
  FACTURA_A: "Factura A",
};

export function CheckoutModal({
  totals,
  orderItemsPayload,
  storeId,
  store,
  cashShiftId,
  quoteId,
  isOnline,
  onNewSale,
  onClose,
}: {
  totals: CartTotals;
  orderItemsPayload: OrderItemPayload[];
  storeId: string;
  store: Store;
  cashShiftId: string;
  quoteId?: string;
  isOnline: boolean;
  onNewSale: () => void;
  onClose: () => void;
}) {
  const createOrder = useCreateOrder();
  const issueInvoice = useIssueInvoice();
  const { data: fiscalConfig } = useFiscalConfig(storeId);
  const { can } = usePlan();
  const fiscalLocked = !can("FISCAL_INVOICING");
  // Si el carrito viene de "Convertir" un presupuesto, precargar su cliente
  // — el cajero no debería tener que volver a buscarlo.
  const { data: sourceQuote } = useQuote(quoteId);

  const [payments, setPayments] = useState<PaymentLine[]>([{ method: "CASH", amount: totals.total }]);
  const [fiscalType, setFiscalType] = useState<RequestedInvoiceType>("TICKET_X");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [completedOrder, setCompletedOrder] = useState<Order | null>(null);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const [issuingInvoice, setIssuingInvoice] = useState(false);
  const [resolvedCustomerId, setResolvedCustomerId] = useState<string | undefined>();
  const [paperSize, setPaperSize] = useState<ReceiptPaperSize>("80mm");
  const confirmRef = useRef<HTMLButtonElement>(null);

  const hasCurrentAccountPayment = payments.some((p) => p.method === "CURRENT_ACCOUNT");
  const needsCustomer = fiscalType === "FACTURA_A" || hasCurrentAccountPayment;

  useEffect(() => {
    confirmRef.current?.focus();
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (sourceQuote?.customer && !selectedCustomer) setSelectedCustomer(sourceQuote.customer);
  }, [sourceQuote, selectedCustomer]);

  // Si el local no tiene fiscal config cargada (o cambió de local), no hay
  // forma de emitir Factura A/B — se cae a Ticket para no dejar seleccionada
  // una opción que el servidor va a rechazar. Reset intencional de estado
  // ante un cambio externo (fiscalConfig), no un valor derivable en el
  // render: fiscalType sigue siendo la fuente de verdad que el usuario
  // controla vía los radios de abajo.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if ((!fiscalConfig || fiscalLocked) && fiscalType !== "TICKET_X") setFiscalType("TICKET_X");
  }, [fiscalConfig, fiscalLocked, fiscalType]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (completedOrder) onNewSale();
      else onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [completedOrder, onNewSale, onClose]);

  const validation = validatePayments(payments, totals.total);
  const paid = sumPayments(payments);
  const remaining = remainingToPay(payments, totals.total);
  const change = computeChange(payments, totals.total);

  function updateLine(i: number, patch: Partial<PaymentLine>) {
    setPayments(payments.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }

  function addLine() {
    setPayments([...payments, { method: "CASH", amount: Math.max(remaining, 0) }]);
  }

  function removeLine(i: number) {
    setPayments(payments.filter((_, idx) => idx !== i));
  }

  async function issueForOrder(orderId: string, requestedType: RequestedInvoiceType, customerId?: string) {
    setIssuingInvoice(true);
    setInvoice(null);
    setInvoiceError(null);
    try {
      const inv = await issueInvoice.mutateAsync({ orderId, requestedType, customerId });
      setInvoice(inv);
      setPaperSize(inv.invoiceType === "FACTURA_A" ? "A4" : "80mm");
    } catch (err) {
      setInvoiceError(err instanceof ApiError ? err.message : "No se pudo emitir el comprobante");
    } finally {
      setIssuingInvoice(false);
    }
  }

  async function handleConfirm() {
    setError(null);
    // Defensa en profundidad: el botón ya queda deshabilitado sin
    // conexión, pero esto cubre el caso borde de perder la conexión justo
    // entre el click y el request — nunca se manda un cobro a medias ni se
    // deja al cajero pensando que la venta se registró sin saberlo.
    if (!isOnline) {
      setError("Sin conexión al servidor — no se puede registrar el cobro. Esperá a reconectar e intentá de nuevo.");
      return;
    }
    if (needsCustomer && !selectedCustomer) {
      setError(
        fiscalType === "FACTURA_A"
          ? "Seleccioná o creá un cliente con CUIT para Factura A"
          : "Seleccioná un cliente para cobrar a cuenta corriente",
      );
      return;
    }
    if (fiscalType === "FACTURA_A" && selectedCustomer && selectedCustomer.docType !== "CUIT") {
      setError("El cliente seleccionado no tiene CUIT — no se puede emitir Factura A");
      return;
    }

    try {
      const customerId = selectedCustomer?.id;
      setResolvedCustomerId(customerId);

      const order = await createOrder.mutateAsync({
        storeId,
        cashShiftId,
        customerId,
        items: orderItemsPayload,
        payments: payments.map((p) => ({ method: p.method, amount: p.amount, reference: p.reference })),
        quoteId,
      });
      setCompletedOrder(order);
      await issueForOrder(order.id, fiscalType, customerId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo registrar la venta");
    }
  }

  if (completedOrder) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/40 p-4 print:hidden">
        {invoice && (
          <ThermalReceipt
            order={completedOrder}
            invoice={invoice}
            store={store}
            fiscalConfig={fiscalConfig ?? null}
            paperSize={paperSize}
          />
        )}
        <div className="w-full max-w-sm space-y-4 rounded-lg bg-surface p-6 text-center bg-surface">
          <div className="text-4xl">✓</div>
          <h2 className="text-lg font-medium">Venta #{completedOrder.orderNumber} registrada</h2>
          <div className="space-y-1 text-sm text-muted">
            <div className="flex justify-between">
              <span>Total</span>
              <span className="font-medium text-foreground  ">
                ${Number(completedOrder.total).toLocaleString("es-AR")}
              </span>
            </div>
            {change > 0 && (
              <div className="flex justify-between">
                <span>Vuelto</span>
                <span className="font-medium text-foreground  ">${change.toLocaleString("es-AR")}</span>
              </div>
            )}
          </div>

          <div className="space-y-2 rounded bg-accent-muted p-3 text-left text-sm bg-accent-muted">
            {issuingInvoice && <p className="text-muted">Emitiendo comprobante…</p>}
            {invoice && invoice.status === "ISSUED" && (
              <>
                <p className="font-medium">{FISCAL_OPTION_LABELS[fiscalType] ?? invoice.invoiceType} emitido</p>
                {invoice.cae && <p className="text-xs text-muted">CAE {invoice.cae}</p>}
              </>
            )}
            {invoice && invoice.status === "REJECTED" && (
              <>
                <p className="text-red-600">AFIP rechazó el comprobante: {invoice.errorMessage}</p>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => void issueForOrder(completedOrder.id, fiscalType, resolvedCustomerId)}
                    className="text-xs underline"
                  >
                    Reintentar
                  </button>
                  <button
                    type="button"
                    onClick={() => void issueForOrder(completedOrder.id, "TICKET_X")}
                    className="text-xs underline"
                  >
                    Emitir Ticket en su lugar
                  </button>
                </div>
              </>
            )}
            {invoiceError && (
              <>
                <p className="text-red-600">{invoiceError}</p>
                <button
                  type="button"
                  onClick={() => void issueForOrder(completedOrder.id, fiscalType, resolvedCustomerId)}
                  className="text-xs underline"
                >
                  Reintentar
                </button>
              </>
            )}
            {invoice && (
              <div className="flex gap-2 pt-1 text-xs text-muted">
                {(["58mm", "80mm", "A4"] as const).map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setPaperSize(size)}
                    className={paperSize === size ? "font-medium text-foreground underline  " : "underline"}
                  >
                    {size}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <button
              type="button"
              onClick={onNewSale}
              className="rounded bg-green-600 py-2 font-medium text-white"
            >
              Nueva venta (F2)
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              disabled={!invoice}
              className="rounded border border-border py-2 disabled:opacity-50  "
            >
              Imprimir comprobante
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md space-y-4 rounded-lg bg-surface p-6 bg-surface"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-medium">Cobrar</h2>

        <div className="flex items-baseline justify-between rounded bg-accent-muted p-3 bg-accent-muted">
          <span className="text-sm text-muted">Total a cobrar</span>
          <span className="text-2xl font-bold">${totals.total.toLocaleString("es-AR")}</span>
        </div>

        <div className="space-y-2">
          {payments.map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              <select
                value={p.method}
                onChange={(e) => updateLine(i, { method: e.target.value as PaymentMethod })}
                className="rounded border border-border px-2 py-1.5 text-sm   bg-surface"
              >
                {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={0}
                step="0.01"
                value={p.amount}
                onChange={(e) => updateLine(i, { amount: Number(e.target.value) })}
                className="w-28 rounded border border-border px-2 py-1.5 text-right text-sm   bg-surface"
              />
              {p.method !== "CASH" && (
                <input
                  placeholder="Nro. operación"
                  value={p.reference ?? ""}
                  onChange={(e) => updateLine(i, { reference: e.target.value })}
                  className="flex-1 rounded border border-border px-2 py-1.5 text-sm   bg-surface"
                />
              )}
              {payments.length > 1 && (
                <button type="button" onClick={() => removeLine(i)} className="text-red-600">
                  ×
                </button>
              )}
            </div>
          ))}
          <button type="button" onClick={addLine} className="text-sm underline">
            + Agregar medio de pago
          </button>
        </div>

        <div className="space-y-1 text-sm">
          <div className="flex justify-between text-muted">
            <span>Pagado</span>
            <span>${paid.toLocaleString("es-AR")}</span>
          </div>
          {remaining > 0 && (
            <div className="flex justify-between text-red-600">
              <span>Falta</span>
              <span>${remaining.toLocaleString("es-AR")}</span>
            </div>
          )}
          {change > 0 && (
            <div className="flex justify-between text-green-600">
              <span>Vuelto</span>
              <span>${change.toLocaleString("es-AR")}</span>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <p className="text-sm text-muted">Comprobante</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {(Object.keys(FISCAL_OPTION_LABELS) as RequestedInvoiceType[]).map((option) => {
              // "Bloqueado por plan" (fiscalLocked) NO es lo mismo que
              // "bloqueado por falta de configuración" (!fiscalConfig): lo
              // primero es accionable (mostrar el cartel Premium), lo
              // segundo es un callejón sin salida real. Por eso el radio NO
              // lleva `disabled` cuando está locked-por-plan — un <input>
              // con disabled HTML no dispara ningún evento al clickearlo, y
              // el popup nunca se abría (ver el bug reportado).
              const planLocked = option !== "TICKET_X" && fiscalLocked;
              const configMissing = option !== "TICKET_X" && !fiscalConfig && !planLocked;
              const dimmed = planLocked || configMissing;
              return (
                <label
                  key={option}
                  className={
                    dimmed
                      ? `flex items-center gap-1 opacity-40 ${planLocked ? "cursor-pointer" : ""}`
                      : "flex items-center gap-1"
                  }
                  onClick={(e) => {
                    if (!planLocked) return;
                    e.preventDefault();
                    setShowUpgrade(true);
                  }}
                >
                  <input
                    type="radio"
                    name="fiscalType"
                    disabled={configMissing}
                    checked={fiscalType === option}
                    onChange={() => {
                      if (planLocked) {
                        setShowUpgrade(true);
                        return;
                      }
                      setFiscalType(option);
                    }}
                  />
                  {FISCAL_OPTION_LABELS[option]}
                  {planLocked && <PremiumBadge />}
                </label>
              );
            })}
          </div>
          {fiscalLocked ? (
            <p className="text-xs text-muted">
              La facturación AFIP es parte del plan pago — en la demo solo se puede emitir Ticket.
              {" "}
              <button
                type="button"
                onClick={() => setShowUpgrade(true)}
                className="underline underline-offset-2"
              >
                Quiero pasar a Premium
              </button>
            </p>
          ) : (
            !fiscalConfig && (
              <p className="text-xs text-muted">
                Este local no tiene configuración fiscal cargada — solo se puede emitir Ticket.
              </p>
            )
          )}
        </div>

        {showUpgrade && (
          <UpgradeModal
            reason="La facturación electrónica AFIP es parte del plan pago. Contactanos para pasar a Premium y emitir Factura A/B/C sin perder lo que ya cargaste."
            onClose={() => setShowUpgrade(false)}
          />
        )}

        {needsCustomer && (
          <div className="space-y-1">
            <p className="text-sm text-muted">
              {fiscalType === "FACTURA_A" ? "Cliente (requiere CUIT)" : "Cliente"}
            </p>
            <CustomerPicker
              selected={selectedCustomer}
              onSelect={setSelectedCustomer}
              docLabel={fiscalType === "FACTURA_A" ? "CUIT (11 dígitos)" : "CUIT/DNI (opcional)"}
              createDefaults={
                fiscalType === "FACTURA_A"
                  ? { docType: "CUIT", taxCondition: "RESPONSABLE_INSCRIPTO" }
                  : undefined
              }
            />
          </div>
        )}

        {!validation.valid && validation.reason === "OVERPAID_WITHOUT_CASH" && (
          <p className="text-sm text-red-600">
            El vuelto solo puede darse en efectivo — ajustá el monto para que no supere el total.
          </p>
        )}
        {!isOnline && (
          <p className="rounded bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
            Sin conexión al servidor: el cobro queda bloqueado para no registrar una venta a medias. Esperá a reconectar.
          </p>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded px-4 py-2 text-sm">
            Cancelar (Esc)
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={handleConfirm}
            disabled={!validation.valid || createOrder.isPending || !isOnline || (needsCustomer && !selectedCustomer)}
            className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {createOrder.isPending ? "Registrando…" : !isOnline ? "Sin conexión" : "Confirmar cobro"}
          </button>
        </div>
      </div>
    </div>
  );
}
