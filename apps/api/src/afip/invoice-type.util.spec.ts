import {
  determineInvoiceType,
  AFIP_CBTE_TIPO,
  AFIP_DOC_TIPO,
  AFIP_ALICUOTA_ID,
} from './invoice-type.util';
import { InvoiceType } from '@pos/database';

describe('determineInvoiceType', () => {
  it('emisor Monotributo -> siempre Factura C, sin importar el cliente', () => {
    expect(determineInvoiceType('MONOTRIBUTO', 'RESPONSABLE_INSCRIPTO')).toBe(
      InvoiceType.FACTURA_C,
    );
    expect(determineInvoiceType('MONOTRIBUTO', 'CONSUMIDOR_FINAL')).toBe(
      InvoiceType.FACTURA_C,
    );
    expect(determineInvoiceType('MONOTRIBUTO', undefined)).toBe(
      InvoiceType.FACTURA_C,
    );
  });

  it('emisor Responsable Inscripto + cliente Responsable Inscripto -> Factura A', () => {
    expect(
      determineInvoiceType('RESPONSABLE_INSCRIPTO', 'RESPONSABLE_INSCRIPTO'),
    ).toBe(InvoiceType.FACTURA_A);
  });

  it('emisor Responsable Inscripto + consumidor final o monotributo -> Factura B', () => {
    expect(
      determineInvoiceType('RESPONSABLE_INSCRIPTO', 'CONSUMIDOR_FINAL'),
    ).toBe(InvoiceType.FACTURA_B);
    expect(determineInvoiceType('RESPONSABLE_INSCRIPTO', 'MONOTRIBUTO')).toBe(
      InvoiceType.FACTURA_B,
    );
    expect(determineInvoiceType('RESPONSABLE_INSCRIPTO', undefined)).toBe(
      InvoiceType.FACTURA_B,
    );
  });

  it('emisor Exento se trata como Responsable Inscripto (A/B, nunca C)', () => {
    expect(determineInvoiceType('EXENTO', 'RESPONSABLE_INSCRIPTO')).toBe(
      InvoiceType.FACTURA_A,
    );
    expect(determineInvoiceType('EXENTO', 'CONSUMIDOR_FINAL')).toBe(
      InvoiceType.FACTURA_B,
    );
  });
});

describe('tablas de códigos AFIP', () => {
  it('mapea las alícuotas al Id oficial', () => {
    expect(AFIP_ALICUOTA_ID.IVA_21).toBe(5);
    expect(AFIP_ALICUOTA_ID.IVA_10_5).toBe(4);
    expect(AFIP_ALICUOTA_ID.IVA_0).toBe(3);
  });

  it('mapea los tipos de comprobante al código oficial', () => {
    expect(AFIP_CBTE_TIPO.FACTURA_A).toBe(1);
    expect(AFIP_CBTE_TIPO.FACTURA_B).toBe(6);
    expect(AFIP_CBTE_TIPO.FACTURA_C).toBe(11);
  });

  it('mapea los tipos de documento al código oficial', () => {
    expect(AFIP_DOC_TIPO.CUIT).toBe(80);
    expect(AFIP_DOC_TIPO.DNI).toBe(96);
    expect(AFIP_DOC_TIPO.FINAL_CONSUMER).toBe(99);
  });
});
