// QR fiscal según RG AFIP 4892/2020. La URL codifica en base64 un JSON con
// esta estructura exacta — cualquier campo de más o de menos hace que el
// lector de AFIP no reconozca el comprobante como válido.
export interface AfipQrPayload {
  ver: 1;
  fecha: string; // YYYY-MM-DD
  cuit: number;
  ptoVta: number;
  tipoCmp: number;
  nroCmp: number;
  importe: number;
  moneda: string; // "PES"
  ctz: number;
  tipoDocRec: number;
  nroDocRec: number;
  tipoCodAut: 'E'; // E = CAE
  codAut: number;
}

export function buildAfipQrUrl(data: Omit<AfipQrPayload, 'ver'>): string {
  const payload: AfipQrPayload = { ver: 1, ...data };
  const base64 = Buffer.from(JSON.stringify(payload)).toString('base64');
  return `https://www.afip.gob.ar/fe/qr/?p=${base64}`;
}

// Decodifica una URL de QR AFIP de vuelta a su payload — usado en los
// tests para verificar que buildAfipQrUrl codificó lo que corresponde.
export function decodeAfipQrUrl(url: string): AfipQrPayload {
  const base64 = new URL(url).searchParams.get('p');
  if (!base64) throw new Error('URL de QR AFIP inválida: falta el parámetro p');
  return JSON.parse(
    Buffer.from(base64, 'base64').toString('utf8'),
  ) as AfipQrPayload;
}
