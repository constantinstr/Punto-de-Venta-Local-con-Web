"use client";

import { useEffect, useState } from "react";
import { toDataURL } from "qrcode";
import type { Order, Invoice, Store, FiscalConfig } from "@pos/shared-types";

export type ReceiptPaperSize = "58mm" | "80mm" | "A4";

const TAX_CONDITION_LABEL: Record<string, string> = {
  MONOTRIBUTO: "Monotributista",
  RESPONSABLE_INSCRIPTO: "IVA Responsable Inscripto",
  EXENTO: "IVA Exento",
};

const INVOICE_TYPE_LABEL: Record<string, string> = {
  FACTURA_A: "FACTURA A",
  FACTURA_B: "FACTURA B",
  FACTURA_C: "FACTURA C",
  TICKET_X: "TICKET",
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "Efectivo",
  DEBIT_CARD: "Débito",
  CREDIT_CARD: "Crédito",
  TRANSFER: "Transferencia",
  MERCADO_PAGO: "Mercado Pago",
  CURRENT_ACCOUNT: "Cuenta corriente",
};

function money(n: number | string): string {
  return `$${Number(n).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Único componente de impresión del POS: se mantiene siempre montado y
// oculto en pantalla (`hidden print:block`) — el truco clásico de impresión
// selectiva vía CSS (ver `#thermal-receipt` en globals.css) esconde todo lo
// demás de la página al imprimir y solo deja visible este nodo.
export function ThermalReceipt({
  order,
  invoice,
  store,
  fiscalConfig,
  paperSize,
}: {
  order: Order;
  invoice: Invoice;
  store: Store;
  fiscalConfig: FiscalConfig | null;
  paperSize: ReceiptPaperSize;
}) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!invoice.afipQrUrl) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQrDataUrl(null);
      return;
    }
    let cancelled = false;
    toDataURL(invoice.afipQrUrl, { margin: 1, width: 160 })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => setQrDataUrl(null));
    return () => {
      cancelled = true;
    };
  }, [invoice.afipQrUrl]);

  const isFiscal = invoice.invoiceType !== "TICKET_X";
  const paid = order.payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const change = Math.max(0, Math.round((paid - Number(order.total)) * 100) / 100);

  const sizeClass =
    paperSize === "A4"
      ? "w-[190mm] p-6 text-[13px] leading-normal"
      : paperSize === "80mm"
        ? "w-[76mm] p-2 text-[11px] leading-tight"
        : "w-[54mm] p-1 text-[9px] leading-tight";

  return (
    <div id="thermal-receipt" className={`hidden print:block ${sizeClass} bg-white font-mono text-black`}>
      <div className="mb-2 space-y-0.5 text-center">
        <p className="text-sm font-bold">{store.name}</p>
        {store.address && <p>{store.address}</p>}
        {fiscalConfig && (
          <>
            <p>CUIT: {fiscalConfig.cuit}</p>
            <p>{TAX_CONDITION_LABEL[fiscalConfig.taxCondition] ?? fiscalConfig.taxCondition}</p>
            {fiscalConfig.grossIncomeNumber && <p>IIBB: {fiscalConfig.grossIncomeNumber}</p>}
          </>
        )}
      </div>

      <div className="border-t border-b border-dashed border-black py-1 text-center">
        <p className="font-bold">{INVOICE_TYPE_LABEL[invoice.invoiceType] ?? invoice.invoiceType}</p>
        {isFiscal ? (
          <p>
            Pto. Vta {String(invoice.ptoVta).padStart(4, "0")} — Comp. Nro{" "}
            {String(invoice.cbteNro ?? 0).padStart(8, "0")}
          </p>
        ) : (
          <p>Ticket Nro {invoice.cbteNro ?? "-"}</p>
        )}
        <p>{new Date(invoice.issuedAt ?? invoice.createdAt).toLocaleString("es-AR")}</p>
      </div>

      {invoice.customer && (
        <div className="border-b border-dashed border-black py-1">
          <p>Cliente: {invoice.customer.businessName ?? invoice.customer.name}</p>
          {invoice.customer.docNumber && (
            <p>
              {invoice.customer.docType}: {invoice.customer.docNumber}
            </p>
          )}
        </div>
      )}

      <div className="my-1 space-y-0.5">
        {order.items.map((item) => (
          <div key={item.id} className="flex justify-between gap-2">
            <span className="flex-1 truncate">
              {item.quantity} x {item.productName}
            </span>
            <span>{money(item.total)}</span>
          </div>
        ))}
      </div>

      <div className="space-y-0.5 border-t border-dashed border-black pt-1">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>{money(order.subtotal)}</span>
        </div>
        {Number(order.discountAmount) > 0 && (
          <div className="flex justify-between">
            <span>Descuento</span>
            <span>-{money(order.discountAmount)}</span>
          </div>
        )}
        <div className="flex justify-between text-sm font-bold">
          <span>TOTAL</span>
          <span>{money(order.total)}</span>
        </div>
      </div>

      <div className="space-y-0.5 border-t border-dashed border-black pt-1">
        {order.payments.map((p) => (
          <div key={p.id} className="flex justify-between">
            <span>{PAYMENT_METHOD_LABELS[p.method] ?? p.method}</span>
            <span>{money(p.amount)}</span>
          </div>
        ))}
        {change > 0 && (
          <div className="flex justify-between">
            <span>Vuelto</span>
            <span>{money(change)}</span>
          </div>
        )}
      </div>

      {isFiscal && invoice.status === "ISSUED" && (
        <div className="mt-2 space-y-0.5 border-t border-dashed border-black pt-1 text-center">
          <p>CAE: {invoice.cae}</p>
          <p>Vto. CAE: {invoice.caeVto ? new Date(invoice.caeVto).toLocaleDateString("es-AR") : "-"}</p>
          {qrDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- data: URL generada en cliente, next/image no aplica
            <img src={qrDataUrl} alt="Código QR AFIP" className="mx-auto mt-1 h-24 w-24" />
          )}
        </div>
      )}
      {!isFiscal && <p className="mt-2 text-center text-[9px]">COMPROBANTE NO VÁLIDO COMO FACTURA</p>}
    </div>
  );
}
