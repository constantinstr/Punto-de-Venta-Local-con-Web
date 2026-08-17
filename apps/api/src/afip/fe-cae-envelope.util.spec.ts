import { buildFeCaeEnvelope } from './fe-cae-envelope.util';
import { AFIP_CBTE_TIPO, AFIP_DOC_TIPO } from './invoice-type.util';
import type { FeCaeRequest } from './afip-gateway.interface';

// Cubre el armado del XML de FECAESolicitar para los tres tipos de factura y
// para las notas de crédito, sin red ni certificados. Es la única forma de
// tener cobertura de Factura A y B: el CUIT de prueba disponible es
// Monotributo y solo puede emitir clase C contra homologación real.
const AUTH = { token: 'TOKEN-X', sign: 'SIGN-X', cuit: '20304050607' };
const CREDENTIAL = { ptoVta: 4 };
const FECHA = '20260817';

function baseRequest(over: Partial<FeCaeRequest> = {}): FeCaeRequest {
  return {
    cbteTipo: AFIP_CBTE_TIPO.FACTURA_B,
    docTipo: AFIP_DOC_TIPO.FINAL_CONSUMER,
    docNro: 0,
    condicionIvaReceptorId: 5,
    cbteNro: 1,
    importeTotal: 121,
    importeNeto: 100,
    importeIva: 21,
    importeExento: 0,
    importeNoGravado: 0,
    alicuotas: [{ id: 5, baseImponible: 100, importe: 21 }],
    ...over,
  };
}

// Extrae el valor de un nodo simple, para no depender del formateo exacto.
function tag(xml: string, name: string): string | null {
  const m = new RegExp(`<ar:${name}>([^<]*)</ar:${name}>`).exec(xml);
  return m ? m[1] : null;
}

describe('buildFeCaeEnvelope', () => {
  describe('Factura B (tipo 6) — IVA discriminado para la liquidación de AFIP', () => {
    const xml = buildFeCaeEnvelope(AUTH, CREDENTIAL, baseRequest(), FECHA);

    it('manda el tipo de comprobante y el punto de venta', () => {
      expect(tag(xml, 'CbteTipo')).toBe('6');
      expect(tag(xml, 'PtoVta')).toBe('4');
    });

    it('discrimina neto e IVA', () => {
      expect(tag(xml, 'ImpTotal')).toBe('121.00');
      expect(tag(xml, 'ImpNeto')).toBe('100.00');
      expect(tag(xml, 'ImpIVA')).toBe('21.00');
    });

    it('incluye el array de alícuotas con base e importe', () => {
      expect(xml).toContain('<ar:Iva>');
      expect(xml).toContain(
        '<ar:AlicIva><ar:Id>5</ar:Id><ar:BaseImp>100.00</ar:BaseImp><ar:Importe>21.00</ar:Importe></ar:AlicIva>',
      );
    });

    it('no manda CbtesAsoc si no es una nota de crédito', () => {
      expect(xml).not.toContain('CbtesAsoc');
    });
  });

  describe('Factura A (tipo 1) — CUIT del receptor y varias alícuotas', () => {
    const xml = buildFeCaeEnvelope(
      AUTH,
      CREDENTIAL,
      baseRequest({
        cbteTipo: AFIP_CBTE_TIPO.FACTURA_A,
        docTipo: AFIP_DOC_TIPO.CUIT,
        docNro: 30712345678,
        condicionIvaReceptorId: 1, // Responsable Inscripto
        importeTotal: 231.5,
        importeNeto: 200,
        importeIva: 31.5,
        alicuotas: [
          { id: 5, baseImponible: 100, importe: 21 },
          { id: 4, baseImponible: 100, importe: 10.5 },
        ],
      }),
      FECHA,
    );

    it('identifica al receptor con CUIT (tipo 80)', () => {
      expect(tag(xml, 'CbteTipo')).toBe('1');
      expect(tag(xml, 'DocTipo')).toBe('80');
      expect(tag(xml, 'DocNro')).toBe('30712345678');
    });

    it('marca la condición de IVA del receptor como Responsable Inscripto', () => {
      expect(tag(xml, 'CondicionIVAReceptorId')).toBe('1');
    });

    it('detalla CADA alícuota por separado (21% y 10,5%)', () => {
      expect(xml).toContain(
        '<ar:AlicIva><ar:Id>5</ar:Id><ar:BaseImp>100.00</ar:BaseImp><ar:Importe>21.00</ar:Importe></ar:AlicIva>',
      );
      expect(xml).toContain(
        '<ar:AlicIva><ar:Id>4</ar:Id><ar:BaseImp>100.00</ar:BaseImp><ar:Importe>10.50</ar:Importe></ar:AlicIva>',
      );
      expect(tag(xml, 'ImpIVA')).toBe('31.50');
    });
  });

  describe('Factura C (tipo 11) — el monotributista no liquida IVA', () => {
    const xml = buildFeCaeEnvelope(
      AUTH,
      CREDENTIAL,
      baseRequest({ cbteTipo: AFIP_CBTE_TIPO.FACTURA_C }),
      FECHA,
    );

    // Estos tres asserts corresponden a los errores 10047, 10048 y 10071 que
    // AFIP devolvió en homologación cuando se mandaba el desglose.
    it('manda ImpIVA en cero (error 10047 si no)', () => {
      expect(tag(xml, 'ImpIVA')).toBe('0.00');
    });

    it('pone todo el importe en ImpNeto (error 10048 si no)', () => {
      expect(tag(xml, 'ImpNeto')).toBe('121.00');
      expect(tag(xml, 'ImpTotal')).toBe('121.00');
      expect(tag(xml, 'ImpOpEx')).toBe('0.00');
      expect(tag(xml, 'ImpTotConc')).toBe('0.00');
    });

    it('OMITE por completo el nodo Iva (error 10071 si no)', () => {
      // No alcanza con mandarlo vacío: AFIP rechaza igual.
      expect(xml).not.toContain('<ar:Iva>');
      expect(xml).not.toContain('AlicIva');
    });
  });

  describe('Notas de crédito — nodo CbtesAsoc', () => {
    const ncRequest = baseRequest({
      cbteTipo: AFIP_CBTE_TIPO.NOTA_CREDITO_C,
      cbteNro: 7,
      cbtesAsoc: [
        {
          tipo: AFIP_CBTE_TIPO.FACTURA_C,
          ptoVta: 4,
          nro: 3,
          cuit: '20304050607',
        },
      ],
    });
    const xml = buildFeCaeEnvelope(AUTH, CREDENTIAL, ncRequest, FECHA);

    it('identifica el comprobante que anula', () => {
      expect(tag(xml, 'CbteTipo')).toBe('13');
      expect(xml).toContain(
        '<ar:CbteAsoc><ar:Tipo>11</ar:Tipo><ar:PtoVta>4</ar:PtoVta><ar:Nro>3</ar:Nro><ar:Cuit>20304050607</ar:Cuit></ar:CbteAsoc>',
      );
    });

    it('respeta la secuencia del XSD: CondicionIVAReceptorId antes que CbtesAsoc', () => {
      // FECAEDetRequest es una <sequence>: si se invierte el orden, AFIP
      // rechaza el mensaje entero por no validar contra el esquema.
      expect(xml.indexOf('CondicionIVAReceptorId')).toBeLessThan(
        xml.indexOf('CbtesAsoc'),
      );
    });

    it('una NC clase C tampoco lleva IVA', () => {
      expect(tag(xml, 'ImpIVA')).toBe('0.00');
      expect(xml).not.toContain('<ar:Iva>');
    });

    it('en una NC clase B sí van CbtesAsoc y el array de IVA, en ese orden', () => {
      const ncB = buildFeCaeEnvelope(
        AUTH,
        CREDENTIAL,
        baseRequest({
          cbteTipo: AFIP_CBTE_TIPO.NOTA_CREDITO_B,
          cbtesAsoc: [
            {
              tipo: AFIP_CBTE_TIPO.FACTURA_B,
              ptoVta: 4,
              nro: 9,
              cuit: '20304050607',
            },
          ],
        }),
        FECHA,
      );
      expect(ncB).toContain('<ar:CbtesAsoc>');
      expect(ncB).toContain('<ar:Iva>');
      expect(ncB.indexOf('CbtesAsoc')).toBeLessThan(ncB.indexOf('<ar:Iva>'));
      expect(tag(ncB, 'ImpIVA')).toBe('21.00');
    });
  });

  describe('autenticación', () => {
    it('incluye token, sign y CUIT del emisor', () => {
      const xml = buildFeCaeEnvelope(AUTH, CREDENTIAL, baseRequest(), FECHA);
      expect(tag(xml, 'Token')).toBe('TOKEN-X');
      expect(tag(xml, 'Sign')).toBe('SIGN-X');
      expect(tag(xml, 'Cuit')).toBe('20304050607');
      expect(tag(xml, 'CbteFch')).toBe(FECHA);
    });
  });
});
