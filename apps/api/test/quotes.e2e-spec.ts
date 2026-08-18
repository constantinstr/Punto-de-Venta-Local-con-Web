import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { prisma, withTenantContext } from '@pos/database';

interface AuthResponseBody {
  tokens: { accessToken: string };
}
interface IdResponseBody {
  id: string;
}
interface ProductResponseBody {
  id: string;
  price: string;
}
interface QuoteResponseBody {
  id: string;
  quoteNumber: number;
  status: string;
  state: string;
  orderId: string | null;
  total: string;
}
interface OrderResponseBody {
  id: string;
}
interface ApiErrorBody {
  message: string | string[];
}

// Corre contra la base de datos real local, igual que los demás e2e-spec de
// este proyecto — no se limpia después (dev/CI descartable, nunca prod).
describe('Quotes (presupuestos) — e2e', () => {
  let app: INestApplication<App>;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  async function registerTenant(name: string, email: string) {
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

    return { auth, storeId };
  }

  async function createSimpleProduct(
    auth: Record<string, string>,
    storeId: string,
    price: number,
  ) {
    const res = await request(app.getHttpServer())
      .post('/products')
      .set(auth)
      .send({
        sku: `SKU-QUOTE-${suffix}-${Math.random().toString(36).slice(2, 8)}`,
        name: 'Producto Presupuesto Test',
        type: 'SIMPLE',
        costPrice: price / 2,
        price,
        vatCondition: 'IVA_21',
        initialStock: [{ storeId, quantity: 10 }],
      })
      .expect(201);
    return res.body as ProductResponseBody;
  }

  // Presupuestos son OWNER/ADMIN/MANAGER únicamente — un CASHIER nunca debe
  // pasar el @Roles del controller (ver quotes.controller.ts).
  async function createCashier(
    auth: Record<string, string>,
    email: string,
  ): Promise<Record<string, string>> {
    await request(app.getHttpServer())
      .post('/users')
      .set(auth)
      .send({
        email,
        password: 'password123',
        fullName: 'Cajero Test',
        role: 'CASHIER',
      })
      .expect(201);

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'password123' })
      .expect(200);
    return {
      Authorization: `Bearer ${(login.body as AuthResponseBody).tokens.accessToken}`,
    };
  }

  async function openShift(auth: Record<string, string>, storeId: string) {
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
    return (shiftRes.body as IdResponseBody).id;
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
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('numera los presupuestos de forma correlativa por local', async () => {
    const { auth, storeId } = await registerTenant(
      'Tenant Numeracion',
      `numeracion-${suffix}@test.com`,
    );
    const product = await createSimpleProduct(auth, storeId, 1000);

    const first = await request(app.getHttpServer())
      .post('/quotes')
      .set(auth)
      .send({ storeId, items: [{ productId: product.id, quantity: 1 }] })
      .expect(201);
    const second = await request(app.getHttpServer())
      .post('/quotes')
      .set(auth)
      .send({ storeId, items: [{ productId: product.id, quantity: 2 }] })
      .expect(201);

    const firstBody = first.body as QuoteResponseBody;
    const secondBody = second.body as QuoteResponseBody;
    expect(secondBody.quoteNumber).toBe(firstBody.quoteNumber + 1);
  });

  it('el PDF responde 200 con un buffer que arranca con %PDF, incluso sin logo cargado', async () => {
    const { auth, storeId } = await registerTenant(
      'Tenant PDF',
      `pdf-${suffix}@test.com`,
    );
    const product = await createSimpleProduct(auth, storeId, 500);

    const quote = await request(app.getHttpServer())
      .post('/quotes')
      .set(auth)
      .send({ storeId, items: [{ productId: product.id, quantity: 3 }] })
      .expect(201);
    const quoteId = (quote.body as QuoteResponseBody).id;

    const pdfRes = await request(app.getHttpServer())
      .get(`/quotes/${quoteId}/pdf`)
      .set(auth)
      .expect(200);

    expect(pdfRes.headers['content-type']).toBe('application/pdf');
    const buffer = pdfRes.body as Buffer;
    expect(buffer.subarray(0, 4).toString('ascii')).toBe('%PDF');
  });

  it('convertir un presupuesto crea la Order y lo deja CONVERTED con su orderId — y un segundo intento falla', async () => {
    const { auth, storeId } = await registerTenant(
      'Tenant Convertir',
      `convertir-${suffix}@test.com`,
    );
    const product = await createSimpleProduct(auth, storeId, 200);
    const cashShiftId = await openShift(auth, storeId);

    const quote = await request(app.getHttpServer())
      .post('/quotes')
      .set(auth)
      .send({ storeId, items: [{ productId: product.id, quantity: 1 }] })
      .expect(201);
    const quoteId = (quote.body as QuoteResponseBody).id;

    const order = await request(app.getHttpServer())
      .post('/orders')
      .set(auth)
      .send({
        storeId,
        cashShiftId,
        quoteId,
        items: [{ productId: product.id, quantity: 1 }],
        payments: [{ method: 'CASH', amount: 200 }],
      })
      .expect(201);
    const orderId = (order.body as OrderResponseBody).id;

    const afterConvert = await request(app.getHttpServer())
      .get(`/quotes/${quoteId}`)
      .set(auth)
      .expect(200);
    const afterConvertBody = afterConvert.body as QuoteResponseBody;
    expect(afterConvertBody.status).toBe('CONVERTED');
    expect(afterConvertBody.orderId).toBe(orderId);

    const secondAttempt = await request(app.getHttpServer())
      .post('/orders')
      .set(auth)
      .send({
        storeId,
        cashShiftId,
        quoteId,
        items: [{ productId: product.id, quantity: 1 }],
        payments: [{ method: 'CASH', amount: 200 }],
      })
      .expect(400);
    expect((secondAttempt.body as ApiErrorBody).message).toContain(
      'ya se convirtió',
    );
  });

  it('un presupuesto vencido se reporta EXPIRED sin que corra ningún job', async () => {
    const { auth, storeId } = await registerTenant(
      'Tenant Vencido',
      `vencido-${suffix}@test.com`,
    );
    const product = await createSimpleProduct(auth, storeId, 300);

    const quote = await request(app.getHttpServer())
      .post('/quotes')
      .set(auth)
      .send({ storeId, items: [{ productId: product.id, quantity: 1 }] })
      .expect(201);
    const quoteId = (quote.body as QuoteResponseBody).id;

    // Sin cron que "marque vencidos" — se fuerza la fecha directo en la base
    // para probar que el estado se DERIVA al leer, no que un job lo escribió.
    const me = await request(app.getHttpServer())
      .get('/auth/me')
      .set(auth)
      .expect(200);
    const tenantId = (me.body as { tenantId: string }).tenantId;

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await withTenantContext(tenantId, (tx) =>
      tx.quote.update({
        where: { id: quoteId },
        data: { validUntil: yesterday },
      }),
    );

    const res = await request(app.getHttpServer())
      .get(`/quotes/${quoteId}`)
      .set(auth)
      .expect(200);
    expect((res.body as QuoteResponseBody).state).toBe('EXPIRED');
    // El status persistido sigue OPEN — solo el estado efectivo cambia.
    expect((res.body as QuoteResponseBody).status).toBe('OPEN');
  });

  it('un tenant no ve los presupuestos de otro tenant', async () => {
    const tenantA = await registerTenant(
      'Tenant A Quotes',
      `tenant-a-quotes-${suffix}@test.com`,
    );
    const tenantB = await registerTenant(
      'Tenant B Quotes',
      `tenant-b-quotes-${suffix}@test.com`,
    );
    const product = await createSimpleProduct(
      tenantA.auth,
      tenantA.storeId,
      400,
    );

    const quote = await request(app.getHttpServer())
      .post('/quotes')
      .set(tenantA.auth)
      .send({
        storeId: tenantA.storeId,
        items: [{ productId: product.id, quantity: 1 }],
      })
      .expect(201);
    const quoteId = (quote.body as QuoteResponseBody).id;

    await request(app.getHttpServer())
      .get(`/quotes/${quoteId}`)
      .set(tenantB.auth)
      .expect(404);
  });

  it('un CASHIER no puede listar, crear ni ver presupuestos', async () => {
    const { auth, storeId } = await registerTenant(
      'Tenant Cashier Quotes',
      `tenant-cashier-quotes-${suffix}@test.com`,
    );
    const product = await createSimpleProduct(auth, storeId, 300);
    const cashierAuth = await createCashier(
      auth,
      `cajero-quotes-${suffix}@test.com`,
    );

    // Un OWNER/ADMIN/MANAGER crea el presupuesto primero, para probar que el
    // CASHIER tampoco puede LEER uno ajeno a su propia creación.
    const quote = await request(app.getHttpServer())
      .post('/quotes')
      .set(auth)
      .send({
        storeId,
        items: [{ productId: product.id, quantity: 1 }],
      })
      .expect(201);
    const quoteId = (quote.body as QuoteResponseBody).id;

    await request(app.getHttpServer())
      .get('/quotes')
      .set(cashierAuth)
      .expect(403);
    await request(app.getHttpServer())
      .get(`/quotes/${quoteId}`)
      .set(cashierAuth)
      .expect(403);
    await request(app.getHttpServer())
      .post('/quotes')
      .set(cashierAuth)
      .send({ storeId, items: [{ productId: product.id, quantity: 1 }] })
      .expect(403);
  });
});
