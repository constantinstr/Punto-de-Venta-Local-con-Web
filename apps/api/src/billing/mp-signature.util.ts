import { createHmac, timingSafeEqual } from 'crypto';

// Mercado Pago firma cada webhook con HMAC-SHA256 sobre un "manifest"
// armado a mano (NO sobre el body crudo, a diferencia de WooCommerce):
//
//   id:<data.id>;request-id:<x-request-id>;ts:<ts>;
//
// donde `ts` y la firma `v1` vienen dentro del header x-signature, con la
// forma `ts=1704908010,v1=618c85345248dd820d5fd456117c2ab2ef8eda45a0282ff693eac24131a5e839`.
// El secreto se genera en el panel de MP (Tus integraciones → Webhooks).
//
// Ref: https://www.mercadopago.com.ar/developers/es/docs/your-integrations/notifications/webhooks
export function verifyMpWebhookSignature(params: {
  xSignature: string | undefined;
  xRequestId: string | undefined;
  dataId: string | undefined;
  secret: string;
}): boolean {
  const { xSignature, xRequestId, dataId, secret } = params;
  if (!xSignature || !xRequestId || !dataId) return false;

  const parts = parseSignatureHeader(xSignature);
  if (!parts.ts || !parts.v1) return false;

  // MP documenta el id en minúsculas cuando es alfanumérico.
  const manifest = `id:${dataId.toLowerCase()};request-id:${xRequestId};ts:${parts.ts};`;
  const expected = createHmac('sha256', secret).update(manifest).digest('hex');

  const expectedBuf = Buffer.from(expected, 'utf8');
  const actualBuf = Buffer.from(parts.v1, 'utf8');
  if (expectedBuf.length !== actualBuf.length) return false;

  // timingSafeEqual para no filtrar el secreto por diferencia de tiempo.
  return timingSafeEqual(expectedBuf, actualBuf);
}

function parseSignatureHeader(header: string): {
  ts?: string;
  v1?: string;
} {
  const result: { ts?: string; v1?: string } = {};
  for (const chunk of header.split(',')) {
    const [rawKey, ...rest] = chunk.split('=');
    const key = rawKey?.trim();
    const value = rest.join('=').trim();
    if (!key || !value) continue;
    if (key === 'ts') result.ts = value;
    if (key === 'v1') result.v1 = value;
  }
  return result;
}
