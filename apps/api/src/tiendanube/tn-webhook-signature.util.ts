import { createHmac, timingSafeEqual } from 'crypto';

// Tienda Nube firma cada webhook con HMAC-SHA256 sobre el body crudo (los
// bytes exactos, antes de cualquier parseo) usando el **secreto de la app de
// partner**, y lo manda en x-linkedstore-hmac-sha256.
//
// Dos diferencias con WooCommerce que importan:
//  - el digest va en hexadecimal, no en base64;
//  - el secreto NO es por comercio: es el mismo de la aplicación para todas
//    las tiendas instaladas. Por eso la firma sola no alcanza para saber a
//    qué tenant pertenece el evento — eso lo resuelve el token firmado que va
//    en la URL del webhook (ver tn-webhook.controller.ts).
//
// Comparación con timingSafeEqual para no filtrar el secreto por diferencia
// de tiempo.
export function verifyTnWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  appSecret: string,
): boolean {
  if (!signatureHeader || !appSecret) return false;

  const expected = createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex');

  const expectedBuf = Buffer.from(expected, 'utf8');
  const actualBuf = Buffer.from(signatureHeader.trim().toLowerCase(), 'utf8');
  if (expectedBuf.length !== actualBuf.length) return false;

  return timingSafeEqual(expectedBuf, actualBuf);
}
