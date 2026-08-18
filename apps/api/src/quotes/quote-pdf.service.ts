import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { withTenantContext, Prisma } from '@pos/database';

type Numeric = Prisma.Decimal | string | number;
import { QUOTE_INCLUDE } from './quotes.service';

// Mismo patrón que STORE_LOGOS_DIR (store-logo.storage.ts): el nombre de
// archivo es siempre un UUID generado por el servidor, nunca el original.
// Antes de tocar el disco con un valor que viene de la base se valida que
// matchee exactamente ese patrón — si alguien manipulara logoUrl a mano no
// podría leer archivos arbitrarios.
const LOGO_PATH_PATTERN =
  /^\/uploads\/stores\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;

const TAX_CONDITION_LABEL: Record<string, string> = {
  MONOTRIBUTO: 'Monotributista',
  RESPONSABLE_INSCRIPTO: 'IVA Responsable Inscripto',
  EXENTO: 'IVA Exento',
};

const CUSTOMER_TAX_CONDITION_LABEL: Record<string, string> = {
  CONSUMIDOR_FINAL: 'Consumidor Final',
  RESPONSABLE_INSCRIPTO: 'Responsable Inscripto',
  MONOTRIBUTO: 'Monotributo',
  EXENTO: 'Exento',
};

function money(n: Numeric): string {
  return `$${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const MARGIN = 40;
const PAGE_BOTTOM = 792 - MARGIN; // A4 en puntos (841.89) menos margen, redondeado
const COLS = [
  { key: 'name', label: 'Producto', x: MARGIN, width: 220 },
  {
    key: 'qty',
    label: 'Cant.',
    x: MARGIN + 220,
    width: 50,
    align: 'right' as const,
  },
  {
    key: 'unitPrice',
    label: 'Precio unit.',
    x: MARGIN + 270,
    width: 90,
    align: 'right' as const,
  },
  {
    key: 'discount',
    label: 'Desc.',
    x: MARGIN + 360,
    width: 70,
    align: 'right' as const,
  },
  {
    key: 'total',
    label: 'Subtotal',
    x: MARGIN + 430,
    width: 85,
    align: 'right' as const,
  },
];

@Injectable()
export class QuotePdfService {
  async buildPdf(tenantId: string, id: string): Promise<Buffer> {
    const quote = await withTenantContext(tenantId, async (tx) => {
      const found = await tx.quote.findFirst({
        where: { id, tenantId },
        include: QUOTE_INCLUDE,
      });
      if (!found) return null;
      const fiscalConfig = await tx.fiscalConfig.findFirst({
        where: { tenantId, storeId: found.storeId },
      });
      return { ...found, fiscalConfig };
    });
    if (!quote) return null as unknown as Buffer;

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: MARGIN, size: 'A4' });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      this.drawHeader(doc, quote);
      this.drawCustomer(doc, quote.customer);
      this.drawTable(doc, quote.items);
      this.drawTotals(doc, quote);
      this.drawFooter(doc, quote);

      doc.end();
    });
  }

  private drawHeader(
    doc: PDFKit.PDFDocument,
    quote: {
      store: {
        name: string;
        address: string | null;
        phone: string | null;
        logoUrl: string | null;
      };
      fiscalConfig: { cuit: string; taxCondition: string } | null;
      quoteNumber: number;
      createdAt: Date;
      validUntil: Date;
    },
  ) {
    let textX = MARGIN;
    const logoUrl = quote.store.logoUrl;
    if (logoUrl && LOGO_PATH_PATTERN.test(logoUrl)) {
      try {
        const absolutePath = join(process.cwd(), logoUrl);
        if (existsSync(absolutePath)) {
          doc.image(absolutePath, MARGIN, MARGIN, { fit: [80, 80] });
          textX = MARGIN + 96;
        }
      } catch {
        // Un presupuesto no puede dejar de imprimirse por un logo corrupto.
      }
    }

    doc
      .fontSize(14)
      .fillColor('#000000')
      .text(quote.store.name, textX, MARGIN, { width: 300 });
    doc.fontSize(9).fillColor('#52525b');
    if (quote.store.address) doc.text(quote.store.address, textX);
    if (quote.store.phone) doc.text(`Tel: ${quote.store.phone}`, textX);
    if (quote.fiscalConfig) {
      doc.text(`CUIT: ${quote.fiscalConfig.cuit}`, textX);
      doc.text(
        TAX_CONDITION_LABEL[quote.fiscalConfig.taxCondition] ??
          quote.fiscalConfig.taxCondition,
        textX,
      );
    }

    doc.fontSize(16).fillColor('#000000');
    doc.text(`PRESUPUESTO Nº ${quote.quoteNumber}`, MARGIN, MARGIN + 100, {
      align: 'right',
    });
    doc.fontSize(9).fillColor('#52525b');
    doc.text(
      `Fecha: ${quote.createdAt.toLocaleDateString('es-AR')}`,
      MARGIN,
      doc.y,
      { align: 'right' },
    );
    doc.text(
      `Válido hasta: ${quote.validUntil.toLocaleDateString('es-AR')}`,
      MARGIN,
      doc.y,
      { align: 'right' },
    );

    doc.moveDown(2);
    doc.fillColor('#000000');
  }

  private drawCustomer(
    doc: PDFKit.PDFDocument,
    customer: {
      name: string;
      lastName: string | null;
      businessName: string | null;
      docType: string;
      docNumber: string | null;
      taxCondition: string;
      address: string | null;
      city: string | null;
      email: string | null;
      phone: string | null;
    } | null,
  ) {
    doc.fontSize(10).fillColor('#000000').text('Cliente', MARGIN, doc.y);
    doc.fontSize(9).fillColor('#3f3f46');
    if (!customer) {
      doc.text('Consumidor Final');
    } else {
      const displayName =
        customer.businessName ||
        [customer.name, customer.lastName].filter(Boolean).join(' ');
      doc.text(displayName);
      if (customer.docNumber)
        doc.text(`${customer.docType} ${customer.docNumber}`);
      doc.text(
        CUSTOMER_TAX_CONDITION_LABEL[customer.taxCondition] ??
          customer.taxCondition,
      );
      const location = [customer.address, customer.city]
        .filter(Boolean)
        .join(', ');
      if (location) doc.text(location);
      if (customer.phone) doc.text(`Tel: ${customer.phone}`);
      if (customer.email) doc.text(customer.email);
    }
    doc.moveDown(1.5);
    doc.fillColor('#000000');
  }

  private drawTableHeader(doc: PDFKit.PDFDocument) {
    const y = doc.y;
    doc.fontSize(9).fillColor('#ffffff');
    doc.rect(MARGIN, y, 515, 18).fill('#18181b');
    doc.fillColor('#ffffff');
    for (const col of COLS) {
      doc.text(col.label, col.x + 2, y + 5, {
        width: col.width - 4,
        align: col.align,
      });
    }
    doc.fillColor('#000000');
    doc.y = y + 22;
  }

  private drawTable(
    doc: PDFKit.PDFDocument,
    items: {
      productName: string;
      sku: string;
      quantity: Numeric;
      unitPrice: Numeric;
      discountAmount: Numeric;
      total: Numeric;
    }[],
  ) {
    this.drawTableHeader(doc);
    doc.fontSize(9);
    for (const item of items) {
      if (doc.y > PAGE_BOTTOM - 20) {
        doc.addPage();
        this.drawTableHeader(doc);
        doc.fontSize(9);
      }
      const y = doc.y;
      doc.fillColor('#000000');
      doc.text(`${item.productName} (${item.sku})`, COLS[0].x + 2, y, {
        width: COLS[0].width - 4,
      });
      const rowY = y;
      doc.text(Number(item.quantity).toLocaleString('es-AR'), COLS[1].x, rowY, {
        width: COLS[1].width - 4,
        align: 'right',
      });
      doc.text(money(item.unitPrice), COLS[2].x, rowY, {
        width: COLS[2].width - 4,
        align: 'right',
      });
      doc.text(money(item.discountAmount), COLS[3].x, rowY, {
        width: COLS[3].width - 4,
        align: 'right',
      });
      doc.text(money(item.total), COLS[4].x, rowY, {
        width: COLS[4].width - 4,
        align: 'right',
      });
      doc.y = Math.max(doc.y, rowY + 16);
      doc
        .moveTo(MARGIN, doc.y)
        .lineTo(MARGIN + 515, doc.y)
        .strokeColor('#e4e4e7')
        .stroke();
      doc.moveDown(0.3);
    }
    doc.moveDown(1);
  }

  private drawTotals(
    doc: PDFKit.PDFDocument,
    quote: {
      subtotal: Numeric;
      discountAmount: Numeric;
      taxAmount: Numeric;
      total: Numeric;
    },
  ) {
    if (doc.y > PAGE_BOTTOM - 80) doc.addPage();
    const x = MARGIN + 350;
    doc.fontSize(9).fillColor('#3f3f46');
    doc.text(`Subtotal: ${money(quote.subtotal)}`, x, doc.y, {
      align: 'right',
    });
    if (Number(quote.discountAmount) > 0) {
      doc.text(`Descuento: -${money(quote.discountAmount)}`, x, doc.y, {
        align: 'right',
      });
    }
    doc.text(`IVA incluido: ${money(quote.taxAmount)}`, x, doc.y, {
      align: 'right',
    });
    doc.fontSize(13).fillColor('#000000');
    doc.text(`Total: ${money(quote.total)}`, x, doc.y + 4, { align: 'right' });
    doc.moveDown(1.5);
  }

  private drawFooter(
    doc: PDFKit.PDFDocument,
    quote: { validUntil: Date; notes: string | null },
  ) {
    doc.fontSize(9).fillColor('#3f3f46');
    if (quote.notes) {
      doc.text('Notas', MARGIN, doc.y);
      doc.text(quote.notes);
      doc.moveDown(1);
    }
    doc.fontSize(8).fillColor('#71717a');
    doc.text(
      `Presupuesto válido hasta el ${quote.validUntil.toLocaleDateString('es-AR')}. Los precios están sujetos a cambio sin previo aviso vencida esta fecha.`,
    );
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').text('Presupuesto — no válido como factura');
    doc.font('Helvetica');
  }
}
