import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { withPlatformContext, withTenantContext } from '@pos/database';
import { DemoPurgeService } from '../src/demo/demo-purge.service';
import { SubscriptionService } from '../src/billing/subscription.service';

interface DemoStartBody {
  user: { id: string; tenantId: string };
  tokens: { accessToken: string };
  demoExpiresAt: string;
}
interface RequestCodeBody {
  ok: true;
  debugCode: string;
}
interface IdResponseBody {
  id: string;
}
interface BillingMeBody {
  plan: {
    tier: string;
    isDemo: boolean;
    limits: { maxProducts: number | null; maxStores: number | null };
    usage: { products: number; stores: number } | null;
    features: Record<string, boolean>;
  };
}
interface ApiErrorBody {
  message: string | string[];
}

// Corre contra la base de datos real local, igual que los demás e2e-spec de
// este proyecto — no se limpia después de las pruebas que NO purgan (dev/CI
// descartable, nunca prod). Las de purga sí se auto-limpian, porque son
// justamente lo que prueban.
describe('Demo (modo de prueba público) — e2e', () => {
  let app: INestApplication<App>;
  let purgeService: DemoPurgeService;
  let subscriptionService: SubscriptionService;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Alta en dos pasos, igual que el flujo real: pedir código + verificarlo.
  // debugCode solo viaja en la respuesta porque THROTTLE_DISABLE_FOR_TESTS
  // está en 'true' para toda la suite (ver DemoService.requestCode) — nunca
  // pasa fuera de tests, así que esto prueba el circuito completo, no un
  // atajo aparte. Sin `email`, genera uno único por llamada (la mayoría de
  // los tests quiere tenants independientes); pasar el mismo email dos veces
  // ejercita "una demo viva por mail" (reissueSession) a propósito.
  async function startDemo(email?: string) {
    const targetEmail =
      email ?? `demo-${suffix}-${Math.random().toString(36).slice(2, 8)}@test.com`;

    const reqRes = await request(app.getHttpServer())
      .post('/demo/request-code')
      .send({ email: targetEmail })
      .expect(200);
    const { debugCode } = reqRes.body as RequestCodeBody;

    const verifyRes = await request(app.getHttpServer())
      .post('/demo/verify-code')
      .send({ email: targetEmail, code: debugCode })
      .expect(200);
    const body = verifyRes.body as DemoStartBody;
    return {
      ...body,
      email: targetEmail,
      auth: { Authorization: `Bearer ${body.tokens.accessToken}` },
    };
  }

  async function openShift(auth: Record<string, string>) {
    const storesRes = await request(app.getHttpServer())
      .get('/stores')
      .set(auth)
      .expect(200);
    const storeId = (storesRes.body as IdResponseBody[])[0].id;

    const registersRes = await request(app.getHttpServer())
      .get('/cash-registers')
      .set(auth)
      .expect(200);
    const cashRegisterId = (registersRes.body as IdResponseBody[])[0].id;

    const shiftRes = await request(app.getHttpServer())
      .post('/cash-shifts/open')
      .set(auth)
      .send({ cashRegisterId, initialAmount: 1000 })
      .expect(201);
    return { storeId, cashShiftId: (shiftRes.body as IdResponseBody).id };
  }

  async function createOrder(
    auth: Record<string, string>,
    storeId: string,
    cashShiftId: string,
    productId: string,
    price: number,
  ) {
    const res = await request(app.getHttpServer())
      .post('/orders')
      .set(auth)
      .send({
        storeId,
        cashShiftId,
        items: [{ productId, quantity: 1 }],
        payments: [{ method: 'CASH', amount: price }],
      })
      .expect(201);
    return (res.body as IdResponseBody).id;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    purgeService = moduleFixture.get(DemoPurgeService);
    subscriptionService = moduleFixture.get(SubscriptionService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('provisiona un tenant demo con catálogo de ejemplo y tokens usables', async () => {
    const demo1 = await startDemo();
    const demo2 = await startDemo();
    expect(demo1.user.tenantId).not.toBe(demo2.user.tenantId);

    const billing = await request(app.getHttpServer())
      .get('/billing/me')
      .set(demo1.auth)
      .expect(200);
    const plan = (billing.body as BillingMeBody).plan;
    expect(plan.tier).toBe('demo');
    expect(plan.isDemo).toBe(true);
    expect(plan.limits).toEqual({ maxProducts: 20, maxStores: 1 });
    expect(plan.usage).toEqual({ products: 9, stores: 1 });
    expect(plan.features).toEqual({
      FISCAL_INVOICING: false,
      WOO_SYNC: false,
      TIENDANUBE_SYNC: false,
    });
  });

  it('un mismo email reingresa a la MISMA demo en vez de crear una nueva', async () => {
    const email = `demo-reissue-${suffix}@test.com`;
    const first = await startDemo(email);
    const second = await startDemo(email);
    expect(second.user.tenantId).toBe(first.user.tenantId);
    expect(second.user.id).toBe(first.user.id);
  });

  it('un código incorrecto da 400 y no deja pasar', async () => {
    const email = `demo-wrongcode-${suffix}@test.com`;
    await request(app.getHttpServer())
      .post('/demo/request-code')
      .send({ email })
      .expect(200);

    const res = await request(app.getHttpServer())
      .post('/demo/verify-code')
      .send({ email, code: '000000' })
      .expect(400);
    expect((res.body as ApiErrorBody).message).toBeDefined();
  });

  it('un código ya usado no sirve una segunda vez', async () => {
    const email = `demo-reuse-${suffix}@test.com`;
    const reqRes = await request(app.getHttpServer())
      .post('/demo/request-code')
      .send({ email })
      .expect(200);
    const { debugCode } = reqRes.body as RequestCodeBody;

    await request(app.getHttpServer())
      .post('/demo/verify-code')
      .send({ email, code: debugCode })
      .expect(200);

    await request(app.getHttpServer())
      .post('/demo/verify-code')
      .send({ email, code: debugCode })
      .expect(400);
  });

  it('la venta normal (Ticket X) funciona sin restricciones', async () => {
    const demo = await startDemo();
    const { storeId, cashShiftId } = await openShift(demo.auth);

    const productsRes = await request(app.getHttpServer())
      .get('/products')
      .set(demo.auth)
      .expect(200);
    const product = (productsRes.body as { id: string; price: string }[])[0];

    const orderId = await createOrder(
      demo.auth,
      storeId,
      cashShiftId,
      product.id,
      Number(product.price),
    );

    // Sin requestedType -> Ticket X implícito, igual que en producción.
    await request(app.getHttpServer())
      .post('/invoices')
      .set(demo.auth)
      .send({ orderId })
      .expect(201);
  });

  it('bloquea facturación fiscal, sync Woo/Tiendanube y un segundo local', async () => {
    const demo = await startDemo();
    const { storeId, cashShiftId } = await openShift(demo.auth);

    const productsRes = await request(app.getHttpServer())
      .get('/products')
      .set(demo.auth)
      .expect(200);
    const product = (productsRes.body as { id: string; price: string }[])[0];
    const orderId = await createOrder(
      demo.auth,
      storeId,
      cashShiftId,
      product.id,
      Number(product.price),
    );

    const fiscalInvoice = await request(app.getHttpServer())
      .post('/invoices')
      .set(demo.auth)
      .send({ orderId, requestedType: 'FACTURA_B' })
      .expect(403);
    expect((fiscalInvoice.body as ApiErrorBody).message).toContain('plan pago');

    await request(app.getHttpServer())
      .post('/fiscal-config')
      .set(demo.auth)
      .send({
        storeId,
        cuit: '20304050607',
        taxCondition: 'RESPONSABLE_INSCRIPTO',
        ptoVta: 1,
        crtCertificate: 'x',
        keyCertificate: 'x',
      })
      .expect(403);

    await request(app.getHttpServer())
      .post('/woocommerce-config')
      .set(demo.auth)
      .send({
        storeId,
        apiUrl: 'https://example.com',
        consumerKey: 'ck',
        consumerSecret: 'cs',
        webhookSecret: 'webhook-secret',
      })
      .expect(403);

    await request(app.getHttpServer())
      .get('/integrations/tiendanube/authorize-url')
      .query({ storeId })
      .set(demo.auth)
      .expect(403);

    await request(app.getHttpServer())
      .post('/stores')
      .set(demo.auth)
      .send({ name: 'Sucursal 2' })
      .expect(403);
  });

  it('permite crear productos hasta el tope de 20 y bloquea el 21°', async () => {
    const demo = await startDemo();
    const { storeId } = await openShift(demo.auth);

    // Ya hay 9 sembrados; se crean 10 más para llegar a 19, después el
    // vigésimo (total 20) debe pasar y el veintiuno debe fallar.
    for (let i = 0; i < 10; i++) {
      await request(app.getHttpServer())
        .post('/products')
        .set(demo.auth)
        .send({
          sku: `DEMO-CAP-${i}`,
          name: `Producto ${i}`,
          type: 'SIMPLE',
          costPrice: 100,
          price: 200,
          vatCondition: 'IVA_21',
          initialStock: [{ storeId, quantity: 1 }],
        })
        .expect(201);
    }

    // 9 sembrados + 10 = 19. El siguiente llega a 20 (permitido).
    await request(app.getHttpServer())
      .post('/products')
      .set(demo.auth)
      .send({
        sku: 'DEMO-CAP-LAST',
        name: 'Producto tope',
        type: 'SIMPLE',
        costPrice: 100,
        price: 200,
        vatCondition: 'IVA_21',
      })
      .expect(201);

    const blocked = await request(app.getHttpServer())
      .post('/products')
      .set(demo.auth)
      .send({
        sku: 'DEMO-CAP-OVER',
        name: 'Producto de más',
        type: 'SIMPLE',
        costPrice: 100,
        price: 200,
        vatCondition: 'IVA_21',
      })
      .expect(403);
    expect((blocked.body as ApiErrorBody).message).toContain('20 productos');
  });

  it('un tenant demo vencido queda bloqueado sin depender del job de limpieza', async () => {
    const demo = await startDemo();

    // Simula el paso del tiempo directamente en la base, sin esperar al job.
    await withPlatformContext((tx) =>
      tx.tenant.update({
        where: { id: demo.user.tenantId },
        data: { demoExpiresAt: new Date(Date.now() - 1000) },
      }),
    );

    const res = await request(app.getHttpServer())
      .get('/products')
      .set(demo.auth)
      .expect(403);
    expect((res.body as ApiErrorBody).message).toContain('venció');
  });

  it('purgeTenant borra un tenant demo completo sin violar FKs', async () => {
    const demo = await startDemo();
    const { storeId, cashShiftId } = await openShift(demo.auth);
    const productsRes = await request(app.getHttpServer())
      .get('/products')
      .set(demo.auth)
      .expect(200);
    const product = (productsRes.body as { id: string; price: string }[])[0];
    const orderId = await createOrder(
      demo.auth,
      storeId,
      cashShiftId,
      product.id,
      Number(product.price),
    );
    await request(app.getHttpServer())
      .post('/invoices')
      .set(demo.auth)
      .send({ orderId })
      .expect(201);

    await purgeService.purgeTenant(demo.user.tenantId);

    const gone = await withPlatformContext((tx) =>
      tx.tenant.findUnique({ where: { id: demo.user.tenantId } }),
    );
    expect(gone).toBeNull();

    // withTenantContext sobre un tenant que ya no existe simplemente no
    // encuentra filas (RLS filtra por un tenant_id que no matchea nada) —
    // confirma que no quedó ni un Order/Product colgado.
    const leftovers = await withTenantContext(demo.user.tenantId, (tx) =>
      tx.order.count({ where: { tenantId: demo.user.tenantId } }),
    );
    expect(leftovers).toBe(0);
  });

  it('purgeTenant se niega a borrar un tenant que no es demo', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register-tenant')
      .send({
        tenantName: `No Demo ${Date.now()}`,
        storeName: 'Local Test',
        ownerFullName: 'Owner Test',
        ownerEmail: `no-demo-${Date.now()}@test.com`,
        ownerPassword: 'password123',
      })
      .expect(201);
    const tenantId = (res.body as DemoStartBody).user.tenantId;

    await expect(purgeService.purgeTenant(tenantId)).rejects.toThrow(
      'NO demo',
    );

    const stillThere = await withPlatformContext((tx) =>
      tx.tenant.findUnique({ where: { id: tenantId } }),
    );
    expect(stillThere).not.toBeNull();
  });

  it('purgeExpired respeta la ventana de gracia: bloqueado hace poco no se borra, bloqueado hace mucho sí', async () => {
    const recentlyBlocked = await startDemo();
    const longBlocked = await startDemo();

    // "Bloqueado hace poco": venció ayer — dentro de los DEMO_PURGE_GRACE_DAYS
    // (default 60) desde hoy, no debería tocarlo la purga física.
    await withPlatformContext((tx) =>
      tx.tenant.update({
        where: { id: recentlyBlocked.user.tenantId },
        data: { demoExpiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      }),
    );
    // "Bloqueado hace mucho": venció hace 61 días — ya pasó la ventana.
    await withPlatformContext((tx) =>
      tx.tenant.update({
        where: { id: longBlocked.user.tenantId },
        data: { demoExpiresAt: new Date(Date.now() - 61 * 24 * 60 * 60 * 1000) },
      }),
    );

    await purgeService.purgeExpired();

    const stillBlocked = await withPlatformContext((tx) =>
      tx.tenant.findUnique({ where: { id: recentlyBlocked.user.tenantId } }),
    );
    expect(stillBlocked).not.toBeNull();

    const purged = await withPlatformContext((tx) =>
      tx.tenant.findUnique({ where: { id: longBlocked.user.tenantId } }),
    );
    expect(purged).toBeNull();
  });

  it('un pago acreditado convierte el tenant demo en pago, en el mismo registro', async () => {
    const demo = await startDemo();
    const tenantId = demo.user.tenantId;

    // Vencido: si la conversión no funcionara, seguiría bloqueado después.
    await withPlatformContext((tx) =>
      tx.tenant.update({
        where: { id: tenantId },
        data: { demoExpiresAt: new Date(Date.now() - 1000) },
      }),
    );
    await request(app.getHttpServer())
      .get('/products')
      .set(demo.auth)
      .expect(403);

    await subscriptionService.applyPayment({
      tenantId,
      mpPaymentId: `test-payment-${tenantId}`,
      amount: 15000,
      status: 'approved',
      payload: {},
    });

    const converted = await withPlatformContext((tx) =>
      tx.tenant.findUnique({ where: { id: tenantId } }),
    );
    expect(converted?.planTier).toBe('standard');
    expect(converted?.demoExpiresAt).toBeNull();

    // Ya no bloqueado, y conservó el catálogo de ejemplo sembrado al crear
    // la demo (mismo tenant, no uno nuevo).
    const productsRes = await request(app.getHttpServer())
      .get('/products')
      .set(demo.auth)
      .expect(200);
    expect((productsRes.body as unknown[]).length).toBe(9);

    // También deja de contar como demo vivo para DEMO_MAX_LIVE / la purga.
    const stillThereAfterPurge = await purgeService
      .purgeExpired()
      .then(() =>
        withPlatformContext((tx) => tx.tenant.findUnique({ where: { id: tenantId } })),
      );
    expect(stillThereAfterPurge).not.toBeNull();
  });
});
