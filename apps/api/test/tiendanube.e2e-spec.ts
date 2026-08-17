import { createHmac } from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { TIENDANUBE_GATEWAY } from '../src/tiendanube/tiendanube-gateway.interface';
import { TnMockGateway } from '../src/tiendanube/tn-mock.gateway';

// Nombre de cola único para esta corrida — mismo motivo que en
// woocommerce.e2e-spec.ts: Jest corre cada archivo en un proceso aparte pero
// todos comparten el mismo Redis, y sin esto los workers de un spec se roban
// los jobs de otro. Alcanza con fijarlo a nivel de módulo: TnQueueService y
// TnWorkerService recién se instancian dentro de `.compile()`, en beforeAll.
process.env.TIENDANUBE_QUEUE_NAME = `tiendanube-queue-test-${process.pid}-${Date.now()}`;
// La app de partner real no hace falta: el gateway está mockeado. Pero el
// controller de OAuth exige un CLIENT_ID para armar la URL, y el de webhooks
// exige el CLIENT_SECRET para verificar la firma.
process.env.TIENDANUBE_CLIENT_ID ??= '99999';
process.env.TIENDANUBE_CLIENT_SECRET ??= 'tn-test-secret';

interface AuthResponseBody {
  tokens: { accessToken: string };
}
interface IdResponseBody {
  id: string;
}
interface TnConfigBody {
  id: string;
  tnStoreId: string;
  isActive: boolean;
  syncStockOutbound: boolean;
  syncStockInbound: boolean;
}
interface StockRowBody {
  productId: string | null;
  variantId: string | null;
  quantity: number;
}

// El SKU y los ids remotos que devuelve TnMockGateway.listProducts().
const MOCK_SKU = 'MOCK-A';
const MOCK_TN_PRODUCT_ID = 101;
const MOCK_TN_VARIANT_ID = 1001;

// Corre contra la base local, igual que woocommerce.e2e-spec.ts. El gateway se
// reemplaza por el simulador con overrideProvider: nunca se toca la red ni hace
// falta una tienda de Tienda Nube real ni la aprobación de la app de partner.
// La app se bootstrapea con rawBody:true (igual que main.ts) porque el webhook
// entrante valida la firma HMAC sobre los bytes exactos del body.
describe('Tienda Nube — e2e (contra simulador)', () => {
  let app: INestApplication<App>;
  let gateway: TnMockGateway;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const appSecret = process.env.TIENDANUBE_CLIENT_SECRET!;

  async function waitFor<T>(
    fn: () => T | undefined | Promise<T | undefined>,
    timeoutMs = 8000,
  ): Promise<T> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const result = await fn();
      if (result !== undefined) return result;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error('waitFor: tiempo agotado esperando la condición');
  }

  async function registerTenantWithOpenShift(name: string, email: string) {
    const res = await request(app.getHttpServer())
      .post('/auth/register-tenant')
      .send({
        tenantName: `${name} ${suffix}`,
        storeName: 'Local Test',
        ownerFullName: 'Owner Test',
        ownerEmail: email,
        ownerPassword: 'password123',
      })
      .expect(201);
    const { accessToken } = (res.body as AuthResponseBody).tokens;
    const auth = { Authorization: `Bearer ${accessToken}` };

    const storesRes = await request(app.getHttpServer())
      .get('/stores')
      .set(auth)
      .expect(200);
    const storeId = (storesRes.body as IdResponseBody[])[0].id;

    const registerRes = await request(app.getHttpServer())
      .post('/cash-registers')
      .set(auth)
      .send({ storeId, name: 'Caja Test' })
      .expect(201);
    const cashRegisterId = (registerRes.body as IdResponseBody).id;

    const shiftRes = await request(app.getHttpServer())
      .post('/cash-shifts/open')
      .set(auth)
      .send({ cashRegisterId, initialAmount: 1000 })
      .expect(201);

    return {
      auth,
      storeId,
      cashShiftId: (shiftRes.body as IdResponseBody).id,
    };
  }

  // Recorre el flujo real de OAuth: pide la URL de autorización (que trae el
  // `state` firmado) y llama al callback con ese state, como haría el
  // navegador del comerciante al volver de Tienda Nube.
  async function connectViaOAuth(
    auth: Record<string, string>,
    storeId: string,
  ): Promise<TnConfigBody> {
    const urlRes = await request(app.getHttpServer())
      .get(`/integrations/tiendanube/authorize-url?storeId=${storeId}`)
      .set(auth)
      .expect(200);
    const state = new URL(
      (urlRes.body as { url: string }).url,
    ).searchParams.get('state')!;

    await request(app.getHttpServer())
      .get(
        `/integrations/tiendanube/callback?code=codigo-ok&state=${encodeURIComponent(state)}`,
      )
      .expect(302);

    const configRes = await request(app.getHttpServer())
      .get(`/tiendanube-config?storeId=${storeId}`)
      .set(auth)
      .expect(200);
    return configRes.body as TnConfigBody;
  }

  async function createProductWithSku(
    auth: Record<string, string>,
    storeId: string,
    sku: string,
    stock: number,
  ) {
    const res = await request(app.getHttpServer())
      .post('/products')
      .set(auth)
      .send({
        sku,
        name: `Producto TN ${sku}`,
        type: 'SIMPLE',
        costPrice: 5,
        price: 10,
        vatCondition: 'IVA_21',
        initialStock: [{ storeId, quantity: stock }],
      })
      .expect(201);
    return res.body as IdResponseBody;
  }

  async function readStockRow(
    auth: Record<string, string>,
    storeId: string,
    productId: string,
  ) {
    const res = await request(app.getHttpServer())
      .get(`/stock?storeId=${storeId}`)
      .set(auth)
      .expect(200);
    return (res.body as StockRowBody[]).find((r) => r.productId === productId);
  }

  function signBody(body: string): string {
    return createHmac('sha256', appSecret).update(body).digest('hex');
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(TIENDANUBE_GATEWAY)
      .useClass(TnMockGateway)
      .compile();
    app = moduleFixture.createNestApplication({ rawBody: true });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    gateway = moduleFixture.get(TIENDANUBE_GATEWAY);
  });

  afterAll(async () => {
    await app.close();
  });

  it('el flujo de OAuth deja la tienda conectada y registra los avisos de pedidos', async () => {
    const tenant = await registerTenantWithOpenShift(
      'Tenant TN OAuth',
      `tn-oauth-${suffix}@test.com`,
    );

    const config = await connectViaOAuth(tenant.auth, tenant.storeId);
    expect(config.tnStoreId).toBe('1234567');
    expect(config.isActive).toBe(true);

    // El token nunca se devuelve por la API — es la credencial con la que se
    // opera la tienda del cliente.
    expect(config).not.toHaveProperty('accessToken');

    const webhooks = await gateway.listWebhooks();
    expect(webhooks.map((w) => w.event)).toContain('order/paid');
  });

  it('vincula el catálogo por SKU sin crear productos', async () => {
    const tenant = await registerTenantWithOpenShift(
      'Tenant TN Catalogo',
      `tn-cat-${suffix}@test.com`,
    );
    await connectViaOAuth(tenant.auth, tenant.storeId);
    await createProductWithSku(tenant.auth, tenant.storeId, MOCK_SKU, 20);

    const res = await request(app.getHttpServer())
      .post('/tiendanube-config/sync-catalog')
      .set(tenant.auth)
      .send({ storeId: tenant.storeId })
      .expect(201);

    const body = res.body as {
      vinculados: number;
      sinCoincidencia: number;
      revisados: number;
    };
    expect(body.vinculados).toBe(1);
    // El simulador expone MOCK-A y MOCK-B; solo MOCK-A existe en el POS.
    expect(body.revisados).toBe(2);
  });

  it('una venta en el POS empuja el stock nuevo a Tienda Nube (outbound)', async () => {
    const tenant = await registerTenantWithOpenShift(
      'Tenant TN Outbound',
      `tn-out-${suffix}@test.com`,
    );
    await connectViaOAuth(tenant.auth, tenant.storeId);
    const product = await createProductWithSku(
      tenant.auth,
      tenant.storeId,
      MOCK_SKU,
      20,
    );
    await request(app.getHttpServer())
      .post('/tiendanube-config/sync-catalog')
      .set(tenant.auth)
      .send({ storeId: tenant.storeId })
      .expect(201);

    await request(app.getHttpServer())
      .post('/orders')
      .set(tenant.auth)
      .send({
        storeId: tenant.storeId,
        cashShiftId: tenant.cashShiftId,
        items: [{ productId: product.id, quantity: 3 }],
        payments: [{ method: 'CASH', amount: 30 }],
      })
      .expect(201);

    // El job corre en BullMQ, así que el valor llega asincrónicamente.
    const pushed = await waitFor(() => {
      const value = gateway.readStock(MOCK_TN_PRODUCT_ID, MOCK_TN_VARIANT_ID);
      return value === 17 ? value : undefined;
    });
    expect(pushed).toBe(17);
  });

  it('un pedido pagado en la tienda descuenta stock del local (inbound)', async () => {
    const tenant = await registerTenantWithOpenShift(
      'Tenant TN Inbound',
      `tn-in-${suffix}@test.com`,
    );
    const config = await connectViaOAuth(tenant.auth, tenant.storeId);
    const product = await createProductWithSku(
      tenant.auth,
      tenant.storeId,
      MOCK_SKU,
      20,
    );
    await request(app.getHttpServer())
      .post('/tiendanube-config/sync-catalog')
      .set(tenant.auth)
      .send({ storeId: tenant.storeId })
      .expect(201);

    const tnOrderId = 900_001;
    gateway.setOrder({
      id: tnOrderId,
      number: 1,
      status: 'paid',
      items: [
        {
          variantId: MOCK_TN_VARIANT_ID,
          sku: MOCK_SKU,
          quantity: 2,
          price: '10.00',
        },
      ],
    });

    // La URL registrada lleva el token firmado que dice a qué tenant pertenece
    // el evento: es lo que permite resolverlo sin aflojar la RLS.
    const webhooks = await gateway.listWebhooks();
    const hookUrl = webhooks.find((w) => w.event === 'order/paid')!.url;
    const token = new URL(hookUrl).searchParams.get('t')!;

    const body = JSON.stringify({
      store_id: Number(config.tnStoreId),
      event: 'order/paid',
      id: tnOrderId,
    });

    await request(app.getHttpServer())
      .post(`/webhooks/tiendanube?t=${encodeURIComponent(token)}`)
      .set('Content-Type', 'application/json')
      .set('x-linkedstore-hmac-sha256', signBody(body))
      .send(body)
      .expect(200);

    const row = await waitFor(async () => {
      const r = await readStockRow(tenant.auth, tenant.storeId, product.id);
      return r?.quantity === 18 ? r : undefined;
    });
    expect(row.quantity).toBe(18);
  });

  it('rechaza un webhook con firma inválida y no toca el stock', async () => {
    const tenant = await registerTenantWithOpenShift(
      'Tenant TN Firma',
      `tn-firma-${suffix}@test.com`,
    );
    const config = await connectViaOAuth(tenant.auth, tenant.storeId);
    const product = await createProductWithSku(
      tenant.auth,
      tenant.storeId,
      MOCK_SKU,
      20,
    );
    await request(app.getHttpServer())
      .post('/tiendanube-config/sync-catalog')
      .set(tenant.auth)
      .send({ storeId: tenant.storeId })
      .expect(201);

    const webhooks = await gateway.listWebhooks();
    const hookUrl = webhooks.find((w) => w.event === 'order/paid')!.url;
    const token = new URL(hookUrl).searchParams.get('t')!;

    const body = JSON.stringify({
      store_id: Number(config.tnStoreId),
      event: 'order/paid',
      id: 900_002,
    });

    await request(app.getHttpServer())
      .post(`/webhooks/tiendanube?t=${encodeURIComponent(token)}`)
      .set('Content-Type', 'application/json')
      .set('x-linkedstore-hmac-sha256', signBody(body + 'alterado'))
      .send(body)
      .expect(401);

    await new Promise((r) => setTimeout(r, 500));
    const row = await readStockRow(tenant.auth, tenant.storeId, product.id);
    expect(row?.quantity).toBe(20);
  });

  it('con la integración apagada, una venta no empuja nada a Tienda Nube', async () => {
    const tenant = await registerTenantWithOpenShift(
      'Tenant TN Apagado',
      `tn-off-${suffix}@test.com`,
    );
    const config = await connectViaOAuth(tenant.auth, tenant.storeId);
    const product = await createProductWithSku(
      tenant.auth,
      tenant.storeId,
      MOCK_SKU,
      50,
    );
    await request(app.getHttpServer())
      .post('/tiendanube-config/sync-catalog')
      .set(tenant.auth)
      .send({ storeId: tenant.storeId })
      .expect(201);

    // Apagar NO borra las credenciales: suspende la sincronización.
    await request(app.getHttpServer())
      .patch(`/tiendanube-config/${config.id}`)
      .set(tenant.auth)
      .send({ isActive: false })
      .expect(200);

    const before = gateway.readStock(MOCK_TN_PRODUCT_ID, MOCK_TN_VARIANT_ID);

    await request(app.getHttpServer())
      .post('/orders')
      .set(tenant.auth)
      .send({
        storeId: tenant.storeId,
        cashShiftId: tenant.cashShiftId,
        items: [{ productId: product.id, quantity: 5 }],
        payments: [{ method: 'CASH', amount: 50 }],
      })
      .expect(201);

    await new Promise((r) => setTimeout(r, 800));
    expect(gateway.readStock(MOCK_TN_PRODUCT_ID, MOCK_TN_VARIANT_ID)).toBe(
      before,
    );

    // Y las credenciales siguen ahí: se puede volver a prender.
    const after = await request(app.getHttpServer())
      .get(`/tiendanube-config?storeId=${tenant.storeId}`)
      .set(tenant.auth)
      .expect(200);
    expect((after.body as TnConfigBody).tnStoreId).toBe('1234567');
  });
});
