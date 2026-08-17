import {
  InvoiceType,
  type CustomerTaxCondition,
  type FiscalTaxCondition,
} from '@pos/database';

// Reglas de determinación automática de tipo de comprobante (AFIP RG
// vigente para venta de bienes/servicios a consumidores/otros RI):
//   - Emisor Monotributo -> siempre Factura C (nunca discrimina IVA).
//   - Emisor Responsable Inscripto + cliente Responsable Inscripto -> A.
//   - Emisor Responsable Inscripto + cualquier otro cliente -> B.
//   - Emisor Exento se trata como Responsable Inscripto a los fines de esta
//     determinación (A/B, nunca C) — la condición EXENTO del emisor no está
//     cubierta explícitamente en las reglas provistas; esta es la
//     interpretación más común en la práctica, documentada acá porque es
//     una decisión de diseño, no un hecho dado.
// El InvoiceType que genera Prisma es un objeto const + tipo unión de
// strings (no un enum de TypeScript de verdad), así que el tipo de retorno
// se expresa como literales — "InvoiceType.FACTURA_A" no es válido en
// posición de tipo acá.
export function determineInvoiceType(
  emisorCondition: FiscalTaxCondition,
  clienteCondition: CustomerTaxCondition | undefined,
): 'FACTURA_A' | 'FACTURA_B' | 'FACTURA_C' {
  if (emisorCondition === 'MONOTRIBUTO') return InvoiceType.FACTURA_C;
  if (clienteCondition === 'RESPONSABLE_INSCRIPTO')
    return InvoiceType.FACTURA_A;
  return InvoiceType.FACTURA_B;
}

// Códigos de tipo de comprobante AFIP (tabla oficial "Tipos de Comprobante").
export const AFIP_CBTE_TIPO: Record<string, number> = {
  FACTURA_A: 1,
  NOTA_CREDITO_A: 3,
  FACTURA_B: 6,
  NOTA_CREDITO_B: 8,
  FACTURA_C: 11,
  NOTA_CREDITO_C: 13,
};

// Qué nota de crédito anula a qué factura. TICKET_X no está: es un
// comprobante interno, no fiscal — anularlo no requiere pasar por AFIP.
const CREDIT_NOTE_FOR = {
  FACTURA_A: InvoiceType.NOTA_CREDITO_A,
  FACTURA_B: InvoiceType.NOTA_CREDITO_B,
  FACTURA_C: InvoiceType.NOTA_CREDITO_C,
} as const;

export type FiscalInvoiceType = keyof typeof CREDIT_NOTE_FOR;

export const CREDIT_NOTE_TYPES: InvoiceType[] = [
  InvoiceType.NOTA_CREDITO_A,
  InvoiceType.NOTA_CREDITO_B,
  InvoiceType.NOTA_CREDITO_C,
];

// Devuelve la nota de crédito que corresponde, o null si ese tipo de
// comprobante no se anula por AFIP (Ticket X, o una NC — no se emite una NC
// de una NC en este circuito).
export function creditNoteTypeFor(
  invoiceType: InvoiceType,
): InvoiceType | null {
  return CREDIT_NOTE_FOR[invoiceType as FiscalInvoiceType] ?? null;
}

// Códigos de tipo de documento del receptor (tabla oficial "Tipos de Documento").
export const AFIP_DOC_TIPO = {
  CUIT: 80,
  DNI: 96,
  PASAPORTE: 94,
  FINAL_CONSUMER: 99,
} as const;

// Códigos de alícuota de IVA AFIP (tabla oficial "Alícuotas de IVA").
export const AFIP_ALICUOTA_ID: Record<string, number> = {
  IVA_21: 5,
  IVA_10_5: 4,
  IVA_0: 3,
};

// Condición del RECEPTOR frente al IVA — obligatoria desde la RG 5616.
// Sin este campo AFIP rechaza con:
//   10246: "Campo Condicion Frente al IVA del receptor es obligatorio
//   conforme a lo reglamentado por la Resolucion General Nro 5616"
//
// Los ids salen del método FEParamGetCondicionIvaReceptor del propio WSFE,
// consultado contra homologación el 17/08/2026 (no inventados):
//   1  IVA Responsable Inscripto            (clases A/ALEY/C)
//   4  IVA Sujeto Exento                    (clases B/C)
//   5  Consumidor Final                     (clase C/49)
//   6  Responsable Monotributo              (clases A/ALEY/C)
// Si algún día hace falta ampliar (monotributo social, exterior, etc.),
// volver a llamar a ese método en vez de copiar una tabla de internet.
export const AFIP_CONDICION_IVA_RECEPTOR = {
  RESPONSABLE_INSCRIPTO: 1,
  EXENTO: 4,
  CONSUMIDOR_FINAL: 5,
  MONOTRIBUTO: 6,
} as const;

// Sin cliente identificado (venta de mostrador anónima) el receptor es, por
// definición, consumidor final.
export function resolveCondicionIvaReceptor(
  clienteCondition: CustomerTaxCondition | undefined,
): number {
  switch (clienteCondition) {
    case 'RESPONSABLE_INSCRIPTO':
      return AFIP_CONDICION_IVA_RECEPTOR.RESPONSABLE_INSCRIPTO;
    case 'MONOTRIBUTO':
      return AFIP_CONDICION_IVA_RECEPTOR.MONOTRIBUTO;
    case 'EXENTO':
      return AFIP_CONDICION_IVA_RECEPTOR.EXENTO;
    case 'CONSUMIDOR_FINAL':
    default:
      return AFIP_CONDICION_IVA_RECEPTOR.CONSUMIDOR_FINAL;
  }
}
