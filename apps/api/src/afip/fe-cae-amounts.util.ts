import type { VatCondition, Prisma } from '@pos/database';
import { AFIP_ALICUOTA_ID } from './invoice-type.util';

export interface OrderItemForInvoice {
  total: Prisma.Decimal | string | number; // monto final de línea (post-descuento), IVA incluido
  vatCondition: VatCondition;
  taxRate: Prisma.Decimal | string | number; // alícuota numérica snapshot (21, 10.5, 0)
}

export interface FeCaeAmounts {
  importeTotal: number;
  importeNeto: number;
  importeIva: number;
  importeExento: number; // ImpOpEx — operaciones exentas
  importeNoGravado: number; // ImpTotConc — conceptos no gravados
  alicuotas: { id: number; baseImponible: number; importe: number }[];
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Agrupa los ítems de una orden por condición de IVA y arma los montos que
// pide FECAESolicitar: neto/IVA discriminado por alícuota para IVA_21,
// IVA_10_5 e IVA_0, y por separado ImpOpEx (Exento) / ImpTotConc (No
// Gravado) — AFIP los trata distinto del array de alícuotas, no son "IVA al
// 0%". Función pura y testeada sin tocar red ni base de datos.
export function buildFeCaeAmounts(items: OrderItemForInvoice[]): FeCaeAmounts {
  const byCondition = new Map<VatCondition, { base: number; iva: number }>();
  let importeTotal = 0;

  for (const item of items) {
    const total = Number(item.total);
    importeTotal += total;

    const rate = Number(item.taxRate);
    const iva = rate > 0 ? total - total / (1 + rate / 100) : 0;
    const base = total - iva;

    const acc = byCondition.get(item.vatCondition) ?? { base: 0, iva: 0 };
    acc.base += base;
    acc.iva += iva;
    byCondition.set(item.vatCondition, acc);
  }

  let importeNeto = 0;
  let importeIva = 0;
  let importeExento = 0;
  let importeNoGravado = 0;
  const alicuotas: FeCaeAmounts['alicuotas'] = [];

  for (const [condition, { base, iva }] of byCondition) {
    if (condition === 'EXENTO') {
      importeExento += base;
      continue;
    }
    if (condition === 'NO_GRAVADO') {
      importeNoGravado += base;
      continue;
    }
    importeNeto += base;
    importeIva += iva;
    alicuotas.push({
      id: AFIP_ALICUOTA_ID[condition],
      baseImponible: round2(base),
      importe: round2(iva),
    });
  }

  return {
    importeTotal: round2(importeTotal),
    importeNeto: round2(importeNeto),
    importeIva: round2(importeIva),
    importeExento: round2(importeExento),
    importeNoGravado: round2(importeNoGravado),
    alicuotas,
  };
}
