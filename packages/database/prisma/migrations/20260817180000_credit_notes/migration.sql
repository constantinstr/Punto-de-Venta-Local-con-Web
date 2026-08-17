-- Notas de crédito: una orden anulada después de haberse facturado necesita
-- DOS comprobantes (la factura original y la NC que la anula), así que el
-- índice único sobre orderId deja de ser válido. La unicidad que importa
-- —que no se repita un número dentro de cada tipo de comprobante— la sigue
-- garantizando @@unique([storeId, invoiceType, cbteNro]), que no se toca.
DROP INDEX "Invoice_orderId_key";

-- CreateIndex
CREATE INDEX "Invoice_orderId_idx" ON "Invoice"("orderId");

-- AlterTable
-- Autorreferencia: la NC apunta a la factura que anula. Alimenta el nodo
-- <CbtesAsoc> que exige WSFE y deja auditable qué comprobante canceló a cuál.
ALTER TABLE "Invoice" ADD COLUMN "relatedInvoiceId" TEXT;

-- CreateIndex
-- Único: una factura puede ser anulada por UNA sola nota de crédito. Es la
-- barrera de base que impide emitir dos NC para el mismo comprobante ante un
-- doble clic o un reintento (ver InvoicesService.issueCreditNote).
CREATE UNIQUE INDEX "Invoice_relatedInvoiceId_key" ON "Invoice"("relatedInvoiceId");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_relatedInvoiceId_fkey" FOREIGN KEY ("relatedInvoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
