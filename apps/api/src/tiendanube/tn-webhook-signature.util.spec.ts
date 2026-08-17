import { createHmac } from 'crypto';
import { verifyTnWebhookSignature } from './tn-webhook-signature.util';

const SECRET = 'secreto-de-la-app';
const BODY = Buffer.from(
  JSON.stringify({ store_id: 1234567, event: 'order/paid', id: 42 }),
  'utf8',
);

function sign(body: Buffer, secret = SECRET): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

describe('verifyTnWebhookSignature', () => {
  it('acepta una firma válida', () => {
    expect(verifyTnWebhookSignature(BODY, sign(BODY), SECRET)).toBe(true);
  });

  it('acepta la firma en mayúsculas (el hexadecimal no distingue caja)', () => {
    expect(
      verifyTnWebhookSignature(BODY, sign(BODY).toUpperCase(), SECRET),
    ).toBe(true);
  });

  it('rechaza una firma calculada con otro secreto', () => {
    expect(verifyTnWebhookSignature(BODY, sign(BODY, 'otro'), SECRET)).toBe(
      false,
    );
  });

  it('rechaza si el body cambió aunque sea un byte', () => {
    const firma = sign(BODY);
    const alterado = Buffer.from(BODY.toString('utf8').replace('42', '43'));
    expect(verifyTnWebhookSignature(alterado, firma, SECRET)).toBe(false);
  });

  it('rechaza cuando no viene el header', () => {
    expect(verifyTnWebhookSignature(BODY, undefined, SECRET)).toBe(false);
  });

  // Sin secreto configurado no hay forma de distinguir un webhook auténtico de
  // uno falsificado: se rechaza todo, nunca se acepta "porque sí".
  it('rechaza cuando el servidor no tiene el secreto configurado', () => {
    expect(verifyTnWebhookSignature(BODY, sign(BODY), '')).toBe(false);
  });

  // Una firma en base64 (el formato de WooCommerce) no debe pasar por
  // accidente: Tienda Nube manda hexadecimal.
  it('rechaza una firma en base64', () => {
    const base64 = createHmac('sha256', SECRET).update(BODY).digest('base64');
    expect(verifyTnWebhookSignature(BODY, base64, SECRET)).toBe(false);
  });
});
