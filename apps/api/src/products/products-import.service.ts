import { BadRequestException, Injectable } from '@nestjs/common';
import { Readable } from 'node:stream';
import ExcelJS from 'exceljs';
import { withTenantContext, VatCondition } from '@pos/database';
import { EcommerceSyncService } from '../integrations/ecommerce-sync.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/types/auth-user';

// v1: solo productos SIMPLE, clave SKU (update si existe, create si no).
// Variantes y combos por planilla quedan afuera — combinatoria de valor
// marginal para lo que pide un mostrador real (ver plan de mejoras).
const CHUNK_SIZE = 200;
const VALID_VAT: string[] = Object.values(VatCondition);

const REQUIRED_COLUMNS = ['sku', 'nombre', 'precio', 'costo', 'condicion iva'];

export interface ImportRowResult {
  row: number;
  action: 'create' | 'update' | 'error';
  sku: string | null;
  name: string | null;
  reason?: string;
}

interface ParsedRow {
  row: number;
  sku: string;
  name: string;
  barcode: string | null;
  categoryName: string | null;
  price: number;
  costPrice: number;
  vatCondition: string;
  trackStock: boolean;
}

@Injectable()
export class ProductsImportService {
  constructor(
    private readonly ecommerceSync: EcommerceSyncService,
    private readonly auditService: AuditService,
  ) {}

  async buildTemplate(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Productos');
    sheet.columns = [
      { header: 'sku', key: 'sku', width: 16 },
      { header: 'nombre', key: 'nombre', width: 32 },
      // Formateada como texto — si no, Excel convierte códigos largos a
      // notación científica y se pierden dígitos al reabrir el archivo.
      {
        header: 'codigo de barras',
        key: 'barcode',
        width: 18,
        style: { numFmt: '@' },
      },
      { header: 'categoria', key: 'categoria', width: 20 },
      { header: 'precio', key: 'precio', width: 14 },
      { header: 'costo', key: 'costo', width: 14 },
      { header: 'condicion iva', key: 'iva', width: 16 },
      { header: 'controla stock', key: 'stock', width: 14 },
    ];
    sheet.getRow(1).font = { bold: true };
    sheet.addRow({
      sku: 'EJ-001',
      nombre: 'Producto de ejemplo',
      barcode: '7791234567890',
      categoria: '',
      precio: '1.234,56',
      costo: '800,00',
      iva: 'IVA_21',
      stock: 'SI',
    });

    const legend = workbook.addWorksheet('Ayuda');
    legend.columns = [{ width: 24 }, { width: 60 }];
    legend.addRows([
      ['Columna', 'Notas'],
      [
        'sku',
        'Obligatorio. Si ya existe, actualiza ese producto; si no, lo crea.',
      ],
      ['nombre', 'Obligatorio.'],
      ['codigo de barras', 'Opcional. Se guarda como texto.'],
      [
        'categoria',
        'Opcional. Debe coincidir con el nombre exacto de una categoría ya creada.',
      ],
      ['precio', 'Obligatorio. Acepta formato 1.234,56 o 1234.56.'],
      ['costo', 'Obligatorio. Mismo formato que precio.'],
      ['condicion iva', `Obligatorio. Uno de: ${VALID_VAT.join(', ')}.`],
      ['controla stock', 'Opcional (SI/NO). Por defecto SI.'],
    ]);

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async preview(
    tenantId: string,
    file: Express.Multer.File,
  ): Promise<{
    results: ImportRowResult[];
    summary: { create: number; update: number; error: number };
  }> {
    const parsed = await this.parseFile(file);
    const results = await this.classifyRows(tenantId, parsed);
    return { results, summary: this.summarize(results) };
  }

  async commit(
    tenantId: string,
    actor: AuthUser,
    file: Express.Multer.File,
  ): Promise<{
    results: ImportRowResult[];
    summary: { create: number; update: number; error: number };
  }> {
    const parsed = await this.parseFile(file);
    const results = await this.classifyRows(tenantId, parsed);
    const validRowNumbers = new Set(
      results.filter((r) => r.action !== 'error').map((r) => r.row),
    );
    const validRows = parsed
      .filter((p) => p.data && validRowNumbers.has(p.row))
      .map((p) => p.data!);

    const priceSyncTargets: { productId: string; price: number }[] = [];

    for (let i = 0; i < validRows.length; i += CHUNK_SIZE) {
      const chunk = validRows.slice(i, i + CHUNK_SIZE);
      const chunkTargets = await withTenantContext(tenantId, async (tx) => {
        const targets: { productId: string; price: number }[] = [];
        const categories = await tx.category.findMany({
          where: { tenantId },
          select: { id: true, name: true },
        });
        const categoryByName = new Map(
          categories.map((c) => [c.name.toLowerCase(), c.id]),
        );

        for (const row of chunk) {
          const categoryId = row.categoryName
            ? categoryByName.get(row.categoryName.toLowerCase())
            : undefined;

          const existing = await tx.product.findFirst({
            where: { tenantId, sku: row.sku },
          });

          const product = existing
            ? await tx.product.update({
                where: { id: existing.id },
                data: {
                  name: row.name,
                  barcode: row.barcode,
                  categoryId,
                  price: row.price,
                  costPrice: row.costPrice,
                  vatCondition: row.vatCondition as VatCondition,
                  trackStock: row.trackStock,
                },
              })
            : await tx.product.create({
                data: {
                  tenantId,
                  sku: row.sku,
                  name: row.name,
                  barcode: row.barcode,
                  categoryId,
                  type: 'SIMPLE',
                  price: row.price,
                  costPrice: row.costPrice,
                  vatCondition: row.vatCondition as VatCondition,
                  trackStock: row.trackStock,
                },
              });

          targets.push({ productId: product.id, price: row.price });
        }

        await this.auditService.record(tx, tenantId, {
          userId: actor.userId,
          userEmail: actor.email,
          action: 'product.bulk-import',
          entityType: 'Product',
          metadata: { rows: chunk.length, offset: i },
        });

        return targets;
      });

      priceSyncTargets.push(...chunkTargets);
    }

    // Fuera de toda transacción a propósito — mismo criterio que el sync de
    // precios en products.service.ts.
    for (const target of priceSyncTargets) {
      await this.ecommerceSync.enqueuePriceSync(
        tenantId,
        target.productId,
        target.price,
      );
    }

    return { results, summary: this.summarize(results) };
  }

  private summarize(results: ImportRowResult[]) {
    return {
      create: results.filter((r) => r.action === 'create').length,
      update: results.filter((r) => r.action === 'update').length,
      error: results.filter((r) => r.action === 'error').length,
    };
  }

  private async classifyRows(
    tenantId: string,
    parsed: {
      row: number;
      data: ParsedRow | null;
      sku?: string | null;
      name?: string | null;
      error?: string;
    }[],
  ): Promise<ImportRowResult[]> {
    const skus = parsed
      .map((p) => p.data?.sku)
      .filter((s): s is string => Boolean(s));

    return withTenantContext(tenantId, async (tx) => {
      const [existingProducts, categories] = await Promise.all([
        tx.product.findMany({
          where: { tenantId, sku: { in: skus } },
          select: { sku: true },
        }),
        tx.category.findMany({ where: { tenantId }, select: { name: true } }),
      ]);
      const existingSkus = new Set(existingProducts.map((p) => p.sku));
      const categoryNames = new Set(
        categories.map((c) => c.name.toLowerCase()),
      );

      const seenInFile = new Set<string>();
      const results: ImportRowResult[] = [];

      for (const p of parsed) {
        if (p.error || !p.data) {
          results.push({
            row: p.row,
            action: 'error',
            sku: p.sku ?? null,
            name: p.name ?? null,
            reason: p.error,
          });
          continue;
        }
        const row = p.data;

        if (seenInFile.has(row.sku)) {
          results.push({
            row: row.row,
            action: 'error',
            sku: row.sku,
            name: row.name,
            reason: 'SKU repetido dentro de la misma planilla',
          });
          continue;
        }
        seenInFile.add(row.sku);

        if (
          row.categoryName &&
          !categoryNames.has(row.categoryName.toLowerCase())
        ) {
          results.push({
            row: row.row,
            action: 'error',
            sku: row.sku,
            name: row.name,
            reason: `Categoría "${row.categoryName}" no existe`,
          });
          continue;
        }

        results.push({
          row: row.row,
          action: existingSkus.has(row.sku) ? 'update' : 'create',
          sku: row.sku,
          name: row.name,
        });
      }

      return results;
    });
  }

  private async parseFile(file: Express.Multer.File): Promise<
    {
      row: number;
      data: ParsedRow | null;
      sku?: string | null;
      name?: string | null;
      error?: string;
    }[]
  > {
    const workbook = new ExcelJS.Workbook();
    const isCsv =
      file.mimetype === 'text/csv' ||
      file.originalname.toLowerCase().endsWith('.csv');
    try {
      if (isCsv) {
        await workbook.csv.read(Readable.from(file.buffer));
      } else {
        await workbook.xlsx.load(file.buffer as unknown as ExcelJS.Buffer);
      }
    } catch {
      throw new BadRequestException(
        'No se pudo leer el archivo — subí un .xlsx o .csv válido',
      );
    }

    const sheet = workbook.worksheets[0];
    if (!sheet)
      throw new BadRequestException('El archivo no tiene hojas de cálculo');

    const columnIndex: Record<string, number> = {};
    sheet.getRow(1).eachCell((cell, colNumber) => {
      const key = this.cellText(cell)?.toLowerCase().trim();
      if (key) columnIndex[key] = colNumber;
    });

    const missing = REQUIRED_COLUMNS.filter((c) => !(c in columnIndex));
    if (missing.length > 0) {
      throw new BadRequestException(
        `Faltan columnas obligatorias en la planilla: ${missing.join(', ')}`,
      );
    }

    const parsed: {
      row: number;
      data: ParsedRow | null;
      sku?: string | null;
      name?: string | null;
      error?: string;
    }[] = [];

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;

      const get = (key: string) =>
        columnIndex[key] ? row.getCell(columnIndex[key]) : undefined;

      const sku = get('sku') ? this.cellText(get('sku')!) : null;
      const name = get('nombre') ? this.cellText(get('nombre')!) : null;
      // Fila totalmente vacía (Excel a veces deja filas fantasma al final).
      if (!sku && !name) return;

      if (!sku || !name) {
        parsed.push({
          row: rowNumber,
          data: null,
          sku,
          name,
          error: !sku ? 'Falta el SKU' : 'Falta el nombre',
        });
        return;
      }

      const price = get('precio') ? this.parseEsArNumber(get('precio')!) : null;
      const costPrice = get('costo')
        ? this.parseEsArNumber(get('costo')!)
        : null;
      const vatRaw = get('condicion iva')
        ? this.cellText(get('condicion iva')!)
        : null;
      const vat = vatRaw?.toUpperCase().trim() ?? null;

      if (price === null || price < 0) {
        parsed.push({
          row: rowNumber,
          data: null,
          sku,
          name,
          error: 'Precio inválido',
        });
        return;
      }
      if (costPrice === null || costPrice < 0) {
        parsed.push({
          row: rowNumber,
          data: null,
          sku,
          name,
          error: 'Costo inválido',
        });
        return;
      }
      if (!vat || !VALID_VAT.includes(vat)) {
        parsed.push({
          row: rowNumber,
          data: null,
          sku,
          name,
          error: `Condición IVA inválida (esperado uno de: ${VALID_VAT.join(', ')})`,
        });
        return;
      }

      const barcodeCell = get('codigo de barras');
      const barcode = barcodeCell ? this.cellText(barcodeCell) : null;
      const categoryCell = get('categoria');
      const categoryName = categoryCell ? this.cellText(categoryCell) : null;
      const stockCell = get('controla stock');
      const stockRaw = stockCell
        ? this.cellText(stockCell)?.toUpperCase().trim()
        : null;
      const trackStock = stockRaw
        ? ['SI', 'TRUE', '1', 'YES'].includes(stockRaw)
        : true;

      parsed.push({
        row: rowNumber,
        data: {
          row: rowNumber,
          sku,
          name,
          barcode: barcode || null,
          categoryName: categoryName || null,
          price,
          costPrice,
          vatCondition: vat,
          trackStock,
        },
      });
    });

    return parsed;
  }

  // Los números enteros (SKU/código de barras) nunca deben pasar por
  // notación exponencial — Math.trunc + String reconstruye el valor exacto
  // para cualquier código de barras real (muy por debajo de 2^53).
  private cellText(cell: ExcelJS.Cell): string | null {
    const v = cell.value;
    if (v === null || v === undefined) return null;
    if (typeof v === 'string') return v.trim() || null;
    if (typeof v === 'number') return String(Math.trunc(v));
    if (typeof v === 'boolean') return String(v);
    if (v instanceof Date) return v.toISOString();
    if (typeof v === 'object') {
      if ('richText' in v && Array.isArray(v.richText)) {
        return (
          v.richText
            .map((r) => r.text)
            .join('')
            .trim() || null
        );
      }
      if ('text' in v && typeof v.text === 'string')
        return v.text.trim() || null;
      if ('result' in v) {
        const result = (v as { result?: ExcelJS.CellValue }).result;
        if (typeof result === 'string') return result.trim() || null;
        if (typeof result === 'number') return String(Math.trunc(result));
      }
    }
    return null;
  }

  private parseEsArNumber(cell: ExcelJS.Cell): number | null {
    const v = cell.value;
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return v;
    const str = this.cellText(cell);
    if (!str) return null;
    // "1.234,56" (miles con punto, decimal con coma) -> 1234.56. Si no hay
    // coma, se asume que el punto ya es decimal (ej. "1234.56").
    const normalized = str.includes(',')
      ? str.replace(/\./g, '').replace(',', '.')
      : str;
    const n = Number(normalized);
    return Number.isFinite(n) ? n : null;
  }
}
