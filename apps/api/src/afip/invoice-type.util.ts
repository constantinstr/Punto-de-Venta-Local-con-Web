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
