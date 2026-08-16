import { createHmac } from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { WOO_GATEWAY } from '../src/woocommerce/woo-gateway.interface';
import { WooMockGateway } from '../src/woocommerce/woo-mock.gateway';

// Nombre de cola único para esta corrida — evita que este archivo compita
// por jobs de BullMQ con el WooWorkerService de otro *.e2e-spec.ts (Jest
// corre cada archivo en un proceso separado, pero todos comparten el mismo
// Redis). Alcanza con fijarlo acá, a nivel de módulo: Nest recién instancia
// WooQueueService/WooWorkerService (y ahí lee esta env var) dentro de
// `.compile()`, en beforeAll — mucho después de que este archivo termine
// de importarse.
process.env.WOO_QUEUE_NAME = `woocommerce-queue-test-${process.pid}-${Date.now()}`;

interface AuthResponseBody {
  tokens: { accessToken: string };
}
interface IdResponseBody {
  id: string;
}
interface ProductResponseBody {
  id: string;
  wooProductId: number | null;
}
interface WooConfigResponseBody {
  id: string;
  webhookUrl: string;
}
interface StockRowBody {
  productId: string | null;
  variantId: string | null;
  quantity: number;
}

// Corre contra la base de datos real local, igual que invoices.e2e-spec.ts.
// WOO_GATEWAY se reemplaza por WooMockGateway vía overrideProvider — nunca
// se toca la red ni se requiere una tienda WooCommerce real. La app se
// bootstrapea con rawBody:true (igual que main.ts) porque el webhook
// entrante necesita los bytes exactos del body para validar la firma HMAC.
describe('WooCommerce sync (Sprint 7) — e2e', () => {
  let app: INestApplication<App>;
  let wooGateway: WooMockGateway;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  async function waitFor<T>(
    fn: () => T | undefined | Promise<T | undefined>,
    timeoutMs = 5000,
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
    const cashShiftId = (shiftRes.body as IdResponseBody).id;

    return { auth, storeId, cashShiftId };
  }

  async function createWooConfig(
    auth: Record<string, string>,
    storeId: string,
    overrides: Record<string, unknown> = {},
  ) {
    const webhookSecret = `whsec-${Math.random().toString(36).slice(2, 12)}`;
    const res = await request(app.getHttpServer())
      .post('/woocommerce-config')
      .set(auth)
      .send({
        storeId,
        apiUrl: 'http://woo-mock.invalid',
        consumerKey: 'ck_test',
        consumerSecret: 'cs_test',
        webhookSecret,
        syncStockOutbound: true,
        syncStockInbound: true,
        ...overrides,
      })
      .expect(201);
    return { ...(res.body as WooConfigResponseBody), webhookSecret };
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
        name: `Producto Woo ${sku}`,
        type: 'SIMPLE',
        costPrice: 5,
        price: 10,
        vatCondition: 'IVA_21',
        initialStock: [{ storeId, quantity: stock }],
      })
      .expect(201);
    return res.body as ProductResponseBody;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(WOO_GATEWAY)
      .useClass(WooMockGateway)
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
    wooGateway = moduleFixture.get(WOO_GATEWAY);
  });

  afterAll(async () => {
    await app.close();
  });

  it('venta en POS de un producto vinculado a WooCommerce encola y aplica la actualización de stock (outbound)', async () => {
    const tenant = await registerTenantWithOpenShift(
      'Tenant Woo Outbound',
      `woo-out-${suffix}@test.com`,
    );
    const sku = `SKU-OUT-${suffix}`;
    const product = await createProductWithSku(
      tenant.auth,
      tenant.storeId,
      sku,
      20,
    );

    wooGateway.seedProduct({
      id: 5001,
      sku,
      name: 'Producto Woo',
      price: '10',
      stockQuantity: 20,
      manageStock: true,
      type: 'simple',
    });
    await createWooConfig(tenant.auth, tenant.storeId);

    await request(app.getHttpServer())
      .post('/integrations/woocommerce/sync-catalog')
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

    const update = await waitFor(() =>
      wooGateway.recordedUpdates.find((u) => u.remoteProductId === 5001),
    );
    expect(update.quantity).toBe(17); // 20 - 3
    expect(update.variationId).toBeUndefined();
  });

  it('un webhook order.processing válido descuenta stock local (inbound) y es idempotente ante reenvíos', async () => {
    const tenant = await registerTenantWithOpenShift(
      'Tenant Woo Inbound',
      `woo-in-${suffix}@test.com`,
    );
    const sku = `SKU-IN-${suffix}`;
    await createProductWithSku(tenant.auth, tenant.storeId, sku, 15);

    wooGateway.seedProduct({
      id: 6002,
      sku,
      name: 'Producto Woo Inbound',
      price: '10',
      stockQuantity: 15,
      manageStock: true,
      type: 'simple',
    });
    const config = await createWooConfig(tenant.auth, tenant.storeId);
    await request(app.getHttpServer())
      .post('/integrations/woocommerce/sync-catalog')
      .set(tenant.auth)
      .send({ storeId: tenant.storeId })
      .expect(201);

    const wcOrder = {
      id: 777001,
      status: 'processing',
      line_items: [{ product_id: 6002, variation_id: 0, quantity: 4, sku }],
    };
    // Se manda como string (no Buffer): superagent re-serializaría un
    // Buffer con JSON.stringify antes de escribirlo en el socket, lo que
    // mandaría bytes distintos a los que se usaron acá para firmar.
    const bodyStr = JSON.stringify(wcOrder);
    const signature = createHmac('sha256', config.webhookSecret)
      .update(Buffer.from(bodyStr))
      .digest('base64');

    await request(app.getHttpServer())
      .post(`/webhooks/woocommerce/orders?configId=${config.id}`)
      .set('Content-Type', 'application/json')
      .set('x-wc-webhook-signature', signature)
      .send(bodyStr)
      .expect(200);

    async function currentQty(): Promise<number | undefined> {
      const res = await request(app.getHttpServer())
        .get(`/stock?storeId=${tenant.storeId}`)
        .set(tenant.auth)
        .expect(200);
      const rows = res.body as StockRowBody[];
      return rows.find((r) => r.variantId === null && r.productId)?.quantity;
    }

    await waitFor(async () => {
      const qty = await currentQty();
      return qty === 11 ? qty : undefined; // 15 - 4
    });

    // Reenvío del mismo webhook (mismo wooOrderId) — no debe volver a
    // descontar stock.
    await request(app.getHttpServer())
      .post(`/webhooks/woocommerce/orders?configId=${config.id}`)
      .set('Content-Type', 'application/json')
      .set('x-wc-webhook-signature', signature)
      .send(bodyStr)
      .expect(200);

    await new Promise((r) => setTimeout(r, 500));
    expect(await currentQty()).toBe(11);
  });

  it('rechaza un webhook con firma inválida (401) y no descuenta stock', async () => {
    const tenant = await registerTenantWithOpenShift(
      'Tenant Woo Firma Invalida',
      `woo-badsig-${suffix}@test.com`,
    );
    const config = await createWooConfig(tenant.auth, tenant.storeId);

    const wcOrder = {
      id: 777002,
      status: 'processing',
      line_items: [],
    };
    const bodyStr = JSON.stringify(wcOrder);

    await request(app.getHttpServer())
      .post(`/webhooks/woocommerce/orders?configId=${config.id}`)
      .set('Content-Type', 'application/json')
      .set('x-wc-webhook-signature', 'firma-invalida-a-proposito')
      .send(bodyStr)
      .expect(401);
  });

  it('"Probar conexión" devuelve success:false ante credenciales que el gateway rechaza', async () => {
    const tenant = await registerTenantWithOpenShift(
      'Tenant Woo Test Connection',
      `woo-testconn-${suffix}@test.com`,
    );
    await createWooConfig(tenant.auth, tenant.storeId, {
      apiUrl: 'http://force-fail.invalid',
    });

    const res = await request(app.getHttpServer())
      .post('/integrations/woocommerce/test-connection')
      .set(tenant.auth)
      .send({ storeId: tenant.storeId })
      .expect(201);

    expect((res.body as { success: boolean }).success).toBe(false);
  });
});
