import { createHmac } from 'crypto';
import { verifyWooWebhookSignature } from './webhook-signature.util';

describe('verifyWooWebhookSignature', () => {
  const secret = 'super-secret-webhook-key';
  const payload = Buffer.from(
    JSON.stringify({ id: 123, status: 'processing' }),
  );

  function sign(body: Buffer, key: string): string {
    return createHmac('sha256', key).update(body).digest('base64');
  }

  it('acepta una firma válida calculada con el mismo secreto', () => {
    const signature = sign(payload, secret);
    expect(verifyWooWebhookSignature(payload, signature, secret)).toBe(true);
  });

  it('rechaza una firma calculada con un secreto distinto', () => {
    const signature = sign(payload, 'otro-secreto');
    expect(verifyWooWebhookSignature(payload, signature, secret)).toBe(false);
  });

  it('rechaza si el body fue manipulado después de firmarlo', () => {
    const signature = sign(payload, secret);
    const tampered = Buffer.from(
      JSON.stringify({ id: 123, status: 'cancelled' }),
    );
    expect(verifyWooWebhookSignature(tampered, signature, secret)).toBe(false);
  });

  it('rechaza cuando falta el header de firma', () => {
    expect(verifyWooWebhookSignature(payload, undefined, secret)).toBe(false);
  });

  it('rechaza una firma con longitud distinta sin lanzar', () => {
    expect(verifyWooWebhookSignature(payload, 'corta', secret)).toBe(false);
  });
});
