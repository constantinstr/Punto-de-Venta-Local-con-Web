import { buildAfipQrUrl, decodeAfipQrUrl } from './qr.util';

describe('buildAfipQrUrl', () => {
  it('genera una URL con el JSON esperado codificado en base64 (RG 4892)', () => {
    const url = buildAfipQrUrl({
      fecha: '2026-08-16',
      cuit: 20304050607,
      ptoVta: 3,
      tipoCmp: 6,
      nroCmp: 145,
      importe: 1500.5,
      moneda: 'PES',
      ctz: 1,
      tipoDocRec: 96,
      nroDocRec: 30123456,
      tipoCodAut: 'E',
      codAut: 71234567890123,
    });

    expect(url).toMatch(/^https:\/\/www\.afip\.gob\.ar\/fe\/qr\/\?p=/);

    const decoded = decodeAfipQrUrl(url);
    expect(decoded).toEqual({
      ver: 1,
      fecha: '2026-08-16',
      cuit: 20304050607,
      ptoVta: 3,
      tipoCmp: 6,
      nroCmp: 145,
      importe: 1500.5,
      moneda: 'PES',
      ctz: 1,
      tipoDocRec: 96,
      nroDocRec: 30123456,
      tipoCodAut: 'E',
      codAut: 71234567890123,
    });
  });

  it('el payload decodificado siempre trae ver:1 aunque no se lo pasen', () => {
    const url = buildAfipQrUrl({
      fecha: '2026-01-01',
      cuit: 1,
      ptoVta: 1,
      tipoCmp: 1,
      nroCmp: 1,
      importe: 1,
      moneda: 'PES',
      ctz: 1,
      tipoDocRec: 99,
      nroDocRec: 0,
      tipoCodAut: 'E',
      codAut: 1,
    });
    expect(decodeAfipQrUrl(url).ver).toBe(1);
  });
});
