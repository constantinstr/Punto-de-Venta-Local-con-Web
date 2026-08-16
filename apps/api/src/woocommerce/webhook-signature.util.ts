import { createHmac, timingSafeEqual } from 'crypto';

// WooCommerce firma cada webhook con HMAC-SHA256 en base64 sobre el body
// crudo (bytes exactos, antes de cualquier parseo JSON) usando el
// webhookSecret configurado — ver x-wc-webhook-signature. Comparación con
// timingSafeEqual para no filtrar el secreto por diferencia de tiempo.
export function verifyWooWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  webhookSecret: string,
): boolean {
  if (!signatureHeader) return false;

  const expected = createHmac('sha256', webhookSecret)
    .update(rawBody)
    .digest('base64');

  const expectedBuf = Buffer.from(expected, 'utf8');
  const actualBuf = Buffer.from(signatureHeader, 'utf8');
  if (expectedBuf.length !== actualBuf.length) return false;

  return timingSafeEqual(expectedBuf, actualBuf);
}
