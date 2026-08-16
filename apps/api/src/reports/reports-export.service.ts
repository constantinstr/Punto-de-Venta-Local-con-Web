import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { ReportsService } from './reports.service';
import { ExportType } from './dto/export-excel-query.dto';
import type { ReportRangeQueryDto } from './dto/report-range-query.dto';

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF18181B' }, // zinc-900, coherente con la paleta del POS
};
const HEADER_FONT: Partial<ExcelJS.Font> = {
  color: { argb: 'FFFFFFFF' },
  bold: true,
};

function styleHeaderRow(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
  });
}

@Injectable()
export class ReportsExportService {
  constructor(private readonly reportsService: ReportsService) {}

  async buildExcel(
    tenantId: string,
    type: ExportType,
    dto: ReportRangeQueryDto,
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'POS SaaS';
    workbook.created = new Date();

    if (type === ExportType.SALES) {
      await this.addSalesSheet(workbook, tenantId, dto);
    } else if (type === ExportType.PRODUCTS) {
      await this.addProductsSheet(workbook, tenantId, dto);
    } else {
      await this.addShiftsSheet(workbook, tenantId, dto);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private async addSalesSheet(
    workbook: ExcelJS.Workbook,
    tenantId: string,
    dto: ReportRangeQueryDto,
  ) {
    const [summary, payments] = await Promise.all([
      this.reportsService.salesSummary(tenantId, dto),
      this.reportsService.paymentMethods(tenantId, dto),
    ]);

    const sheet = workbook.addWorksheet('Resumen de ventas');
    sheet.columns = [{ width: 32 }, { width: 20 }];
    sheet.addRow(['Facturación bruta', summary.grossRevenue]);
    sheet.addRow(['Facturación neta', summary.netRevenue]);
    sheet.addRow(['Descuentos totales', summary.totalDiscounts]);
    sheet.addRow(['Costo de mercadería vendida', summary.totalCost]);
    sheet.addRow(['Margen bruto estimado', summary.grossMargin]);
    sheet.addRow(['Ticket promedio', summary.averageTicket]);
    sheet.addRow(['Ventas completadas', summary.completedCount]);
    sheet.addRow(['Ventas canceladas', summary.cancelledCount]);
    sheet.addRow([]);
    styleHeaderRow(sheet.addRow(['IVA por alícuota', '']));
    sheet.addRow(['Alícuota (%)', 'Monto']);
    for (const v of summary.vatByRate) sheet.addRow([v.rate, v.amount]);
    sheet.addRow([]);

    const payHeader = sheet.addRow([
      'Medio de pago',
      'Operaciones',
      'Total',
      '%',
    ]);
    styleHeaderRow(payHeader);
    for (const p of payments.breakdown) {
      sheet.addRow([p.method, p.count, p.total, p.percentage]);
    }
  }

  private async addProductsSheet(
    workbook: ExcelJS.Workbook,
    tenantId: string,
    dto: ReportRangeQueryDto,
  ) {
    const report = await this.reportsService.topProducts(tenantId, {
      ...dto,
      limit: 100,
    });
    const sheet = workbook.addWorksheet('Productos más vendidos');
    sheet.columns = [
      { header: 'Producto', key: 'name', width: 32 },
      { header: 'SKU', key: 'sku', width: 18 },
      { header: 'Unidades vendidas', key: 'unitsSold', width: 18 },
      { header: 'Facturación', key: 'revenue', width: 16 },
      { header: 'Costo', key: 'cost', width: 14 },
      { header: 'Margen', key: 'margin', width: 14 },
      { header: 'Unidades mostrador', key: 'posUnits', width: 18 },
      { header: 'Unidades online', key: 'onlineUnits', width: 16 },
    ];
    styleHeaderRow(sheet.getRow(1));
    for (const p of report.products) sheet.addRow(p);
  }

  private async addShiftsSheet(
    workbook: ExcelJS.Workbook,
    tenantId: string,
    dto: ReportRangeQueryDto,
  ) {
    const report = await this.reportsService.cashShiftsHistory(tenantId, dto);
    const sheet = workbook.addWorksheet('Historial de cajas');
    sheet.columns = [
      { header: 'Caja', key: 'cashRegisterName', width: 20 },
      { header: 'Cajero/a', key: 'userFullName', width: 24 },
      { header: 'Apertura', key: 'openedAt', width: 22 },
      { header: 'Cierre', key: 'closedAt', width: 22 },
      { header: 'Monto inicial', key: 'initialAmount', width: 16 },
      { header: 'Esperado', key: 'expectedCash', width: 16 },
      { header: 'Real declarado', key: 'actualCash', width: 16 },
      { header: 'Diferencia', key: 'difference', width: 16 },
    ];
    styleHeaderRow(sheet.getRow(1));
    for (const s of report.shifts) sheet.addRow(s);
  }

  // "Resumen ejecutivo" de una página — no reemplaza el detalle del Excel,
  // es para mandar por WhatsApp/email al dueño sin que tenga que abrir una
  // planilla.
  async buildExecutivePdf(
    tenantId: string,
    dto: ReportRangeQueryDto,
  ): Promise<Buffer> {
    const [summary, payments, topProducts] = await Promise.all([
      this.reportsService.salesSummary(tenantId, dto),
      this.reportsService.paymentMethods(tenantId, dto),
      this.reportsService.topProducts(tenantId, { ...dto, limit: 5 }),
    ]);

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const money = (n: number) =>
        `$${n.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
      const fromLabel = new Date(summary.from).toLocaleDateString('es-AR');
      const toLabel = new Date(summary.to).toLocaleDateString('es-AR');

      doc.fontSize(18).text('Resumen ejecutivo de ventas', { align: 'left' });
      doc.fontSize(10).fillColor('#71717a').text(`${fromLabel} — ${toLabel}`);
      doc.moveDown(1.5);

      doc.fillColor('#000000').fontSize(13).text('Indicadores clave');
      doc.fontSize(10);
      doc.text(`Facturación bruta: ${money(summary.grossRevenue)}`);
      doc.text(`Facturación neta: ${money(summary.netRevenue)}`);
      doc.text(`Margen bruto estimado: ${money(summary.grossMargin)}`);
      doc.text(`Ticket promedio: ${money(summary.averageTicket)}`);
      doc.text(
        `Ventas: ${summary.completedCount} completadas / ${summary.cancelledCount} canceladas`,
      );
      doc.moveDown(1);

      doc.fontSize(13).text('Medios de pago');
      doc.fontSize(10);
      for (const p of payments.breakdown) {
        doc.text(
          `${p.method}: ${money(p.total)} (${p.percentage}%) — ${p.count} op.`,
        );
      }
      doc.moveDown(1);

      doc.fontSize(13).text('Top 5 productos');
      doc.fontSize(10);
      for (const p of topProducts.products) {
        doc.text(`${p.name} — ${p.unitsSold} un. — ${money(p.revenue)}`);
      }

      doc.end();
    });
  }
}
