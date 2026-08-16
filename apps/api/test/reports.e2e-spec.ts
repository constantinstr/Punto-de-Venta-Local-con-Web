import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { withTenantContext } from '@pos/database';

interface AuthResponseBody {
  tokens: { accessToken: string };
  user: { id: string };
}
interface IdResponseBody {
  id: string;
}
interface ProductResponseBody {
  id: string;
}
interface OrderResponseBody {
  id: string;
  total: string;
}
interface SalesSummaryBody {
  grossRevenue: number;
  netRevenue: number;
  totalDiscounts: number;
  totalCost: number;
  grossMargin: number;
  averageTicket: number;
  completedCount: number;
  cancelledCount: number;
  vatByRate: { rate: number; amount: number }[];
  timeSeries: { date: string; grossRevenue: number; ticketCount: number }[];
}
interface PaymentMethodsBody {
  breakdown: {
    method: string;
    count: number;
    total: number;
    percentage: number;
  }[];
  grandTotal: number;
}
interface TopProductsBody {
  products: {
    productId: string;
    unitsSold: number;
    revenue: number;
    cost: number;
    margin: number;
    posUnits: number;
    onlineUnits: number;
  }[];
}
interface CashShiftsHistoryBody {
  shifts: { id: string; difference: number | null }[];
}

// Corre contra la base de datos real local, igual que los demás e2e-spec.
describe('Reports (Sprint 8) — e2e', () => {
  let app: INestApplication<App>;
  const suffix = Date.now();

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
    const body = res.body as AuthResponseBody;
    const auth = { Authorization: `Bearer ${body.tokens.accessToken}` };

    const storesRes = await request(app.getHttpServer())
      .get('/stores')
      .set(auth)
      .expect(200);
    const storeId = (storesRes.body as IdResponseBody[])[0].id;

    return { auth, storeId, ownerUserId: body.user.id };
  }

  async function openShift(auth: Record<string, string>, storeId: string) {
    const registerRes = await request(app.getHttpServer())
      .post('/cash-registers')
      .set(auth)
      .send({ storeId, name: `Caja ${Math.random()}` })
      .expect(201);
    const cashRegisterId = (registerRes.body as IdResponseBody).id;

    const shiftRes = await request(app.getHttpServer())
      .post('/cash-shifts/open')
      .set(auth)
      .send({ cashRegisterId, initialAmount: 1000 })
      .expect(201);
    return {
      cashRegisterId,
      cashShiftId: (shiftRes.body as IdResponseBody).id,
    };
  }

  async function createProduct(
    auth: Record<string, string>,
    storeId: string,
    price: number,
    costPrice: number,
    stock: number,
  ) {
    const res = await request(app.getHttpServer())
      .post('/products')
      .set(auth)
      .send({
        sku: `SKU-REP-${suffix}-${Math.random().toString(36).slice(2, 8)}`,
        name: 'Producto Reportes Test',
        type: 'SIMPLE',
        costPrice,
        price,
        vatCondition: 'IVA_21',
        initialStock: [{ storeId, quantity: stock }],
      })
      .expect(201);
    return res.body as ProductResponseBody;
  }

  async function createOrder(
    auth: Record<string, string>,
    storeId: string,
    cashShiftId: string,
    productId: string,
    quantity: number,
    price: number,
  ) {
    const res = await request(app.getHttpServer())
      .post('/orders')
      .set(auth)
      .send({
        storeId,
        cashShiftId,
        items: [{ productId, quantity }],
        payments: [{ method: 'CASH', amount: price * quantity }],
      })
      .expect(201);
    return res.body as OrderResponseBody;
  }

  async function backdateOrder(tenantId: string, orderId: string, date: Date) {
    await withTenantContext(tenantId, (tx) =>
      tx.order.update({ where: { id: orderId }, data: { createdAt: date } }),
    );
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
  });

  it('calcula facturación, IVA por alícuota, CMV y margen para ventas dentro del rango', async () => {
    const tenant = await registerTenant(
      'Tenant Reportes',
      `rep-${suffix}@test.com`,
    );
    const { cashShiftId } = await openShift(tenant.auth, tenant.storeId);
    const product = await createProduct(
      tenant.auth,
      tenant.storeId,
      121,
      60,
      20,
    );

    await createOrder(
      tenant.auth,
      tenant.storeId,
      cashShiftId,
      product.id,
      1,
      121,
    );
    await createOrder(
      tenant.auth,
      tenant.storeId,
      cashShiftId,
      product.id,
      2,
      121,
    );
    const cancelledOrder = await createOrder(
      tenant.auth,
      tenant.storeId,
      cashShiftId,
      product.id,
      1,
      121,
    );
    await request(app.getHttpServer())
      .post(`/orders/${cancelledOrder.id}/cancel`)
      .set(tenant.auth)
      .expect(201);

    const today = new Date().toISOString().slice(0, 10);
    const res = await request(app.getHttpServer())
      .get(
        `/reports/sales-summary?from=${today}&to=${today}&storeId=${tenant.storeId}`,
      )
      .set(tenant.auth)
      .expect(200);
    const body = res.body as SalesSummaryBody;

    // 3 unidades a $121 (IVA 21% incluido) = $363 bruto, $300 neto, $63 IVA.
    expect(body.grossRevenue).toBe(363);
    expect(body.netRevenue).toBe(300);
    expect(body.completedCount).toBe(2);
    expect(body.cancelledCount).toBe(1);
    expect(body.vatByRate).toEqual([{ rate: 21, amount: 63 }]);
    // costo $60 x 3 unidades = $180; margen = 300 - 180 = 120.
    expect(body.totalCost).toBe(180);
    expect(body.grossMargin).toBe(120);
    expect(body.averageTicket).toBe(181.5); // (121 + 242) / 2
    expect(body.timeSeries.length).toBeGreaterThan(0);
  });

  it('excluye ventas fuera del rango de fechas pedido', async () => {
    const tenant = await registerTenant(
      'Tenant Rango Fechas',
      `rango-${suffix}@test.com`,
    );
    const { cashShiftId } = await openShift(tenant.auth, tenant.storeId);
    const product = await createProduct(
      tenant.auth,
      tenant.storeId,
      100,
      40,
      10,
    );
    const order = await createOrder(
      tenant.auth,
      tenant.storeId,
      cashShiftId,
      product.id,
      1,
      100,
    );

    await backdateOrder(
      (
        (
          await request(app.getHttpServer())
            .get('/auth/me')
            .set(tenant.auth)
            .expect(200)
        ).body as { tenantId: string }
      ).tenantId,
      order.id,
      new Date('2020-01-15T12:00:00.000Z'),
    );

    const outsideRes = await request(app.getHttpServer())
      .get(
        `/reports/sales-summary?from=2021-01-01&to=2021-01-31&storeId=${tenant.storeId}`,
      )
      .set(tenant.auth)
      .expect(200);
    expect((outsideRes.body as SalesSummaryBody).completedCount).toBe(0);

    const insideRes = await request(app.getHttpServer())
      .get(
        `/reports/sales-summary?from=2020-01-01&to=2020-01-31&storeId=${tenant.storeId}`,
      )
      .set(tenant.auth)
      .expect(200);
    expect((insideRes.body as SalesSummaryBody).completedCount).toBe(1);
  });

  it('rechaza un rango con "from" posterior a "to" (400)', async () => {
    const tenant = await registerTenant(
      'Tenant Rango Invalido',
      `rangoinv-${suffix}@test.com`,
    );
    await request(app.getHttpServer())
      .get(
        `/reports/sales-summary?from=2026-05-01&to=2026-01-01&storeId=${tenant.storeId}`,
      )
      .set(tenant.auth)
      .expect(400);
  });

  it('aísla estrictamente por tenantId: un tenant nunca ve ventas de otro', async () => {
    const tenantA = await registerTenant(
      'Tenant Aislado A',
      `iso-a-${suffix}@test.com`,
    );
    const shiftA = await openShift(tenantA.auth, tenantA.storeId);
    const productA = await createProduct(
      tenantA.auth,
      tenantA.storeId,
      500,
      200,
      10,
    );
    await createOrder(
      tenantA.auth,
      tenantA.storeId,
      shiftA.cashShiftId,
      productA.id,
      1,
      500,
    );

    const tenantB = await registerTenant(
      'Tenant Aislado B',
      `iso-b-${suffix}@test.com`,
    );

    const today = new Date().toISOString().slice(0, 10);
    const resB = await request(app.getHttpServer())
      .get(`/reports/sales-summary?from=${today}&to=${today}`)
      .set(tenantB.auth)
      .expect(200);
    expect((resB.body as SalesSummaryBody).completedCount).toBe(0);
    expect((resB.body as SalesSummaryBody).grossRevenue).toBe(0);
  });

  it('bloquea el acceso a usuarios con rol CASHIER (403)', async () => {
    const tenant = await registerTenant(
      'Tenant Cajero Bloqueado',
      `cashier-${suffix}@test.com`,
    );
    await request(app.getHttpServer())
      .post('/users')
      .set(tenant.auth)
      .send({
        email: `cajero-${suffix}@test.com`,
        password: 'password123',
        fullName: 'Cajero Test',
        role: 'CASHIER',
      })
      .expect(201);

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: `cajero-${suffix}@test.com`, password: 'password123' })
      .expect(200);
    const cashierAuth = {
      Authorization: `Bearer ${(loginRes.body as AuthResponseBody).tokens.accessToken}`,
    };

    const today = new Date().toISOString().slice(0, 10);
    await request(app.getHttpServer())
      .get(`/reports/sales-summary?from=${today}&to=${today}`)
      .set(cashierAuth)
      .expect(403);
  });

  it('desglosa medios de pago con porcentajes que suman el total recaudado', async () => {
    const tenant = await registerTenant(
      'Tenant Medios de Pago',
      `pay-${suffix}@test.com`,
    );
    const { cashShiftId } = await openShift(tenant.auth, tenant.storeId);
    const product = await createProduct(
      tenant.auth,
      tenant.storeId,
      200,
      80,
      10,
    );

    await request(app.getHttpServer())
      .post('/orders')
      .set(tenant.auth)
      .send({
        storeId: tenant.storeId,
        cashShiftId,
        items: [{ productId: product.id, quantity: 1 }],
        payments: [{ method: 'DEBIT_CARD', amount: 200 }],
      })
      .expect(201);

    const today = new Date().toISOString().slice(0, 10);
    const res = await request(app.getHttpServer())
      .get(
        `/reports/payment-methods?from=${today}&to=${today}&storeId=${tenant.storeId}`,
      )
      .set(tenant.auth)
      .expect(200);
    const body = res.body as PaymentMethodsBody;

    expect(body.grandTotal).toBe(200);
    expect(body.breakdown).toEqual([
      { method: 'DEBIT_CARD', count: 1, total: 200, percentage: 100 },
    ]);
  });

  it('rankea productos más vendidos y separa unidades por canal (POS)', async () => {
    const tenant = await registerTenant(
      'Tenant Top Productos',
      `top-${suffix}@test.com`,
    );
    const { cashShiftId } = await openShift(tenant.auth, tenant.storeId);
    const product = await createProduct(
      tenant.auth,
      tenant.storeId,
      50,
      20,
      20,
    );
    await createOrder(
      tenant.auth,
      tenant.storeId,
      cashShiftId,
      product.id,
      5,
      50,
    );

    const today = new Date().toISOString().slice(0, 10);
    const res = await request(app.getHttpServer())
      .get(
        `/reports/top-products?from=${today}&to=${today}&storeId=${tenant.storeId}&limit=5`,
      )
      .set(tenant.auth)
      .expect(200);
    const body = res.body as TopProductsBody;

    expect(body.products[0].productId).toBe(product.id);
    expect(body.products[0].unitsSold).toBe(5);
    expect(body.products[0].revenue).toBe(250);
    expect(body.products[0].posUnits).toBe(5);
    expect(body.products[0].onlineUnits).toBe(0);
    expect(body.products[0].cost).toBe(100); // $20 costo x 5 unidades
    expect(body.products[0].margin).toBe(150); // 250 - 100
  });

  it('lista turnos de caja cerrados con la diferencia declarada', async () => {
    const tenant = await registerTenant(
      'Tenant Historial Cajas',
      `shifts-${suffix}@test.com`,
    );
    const { cashShiftId } = await openShift(tenant.auth, tenant.storeId);

    await request(app.getHttpServer())
      .post(`/cash-shifts/${cashShiftId}/close`)
      .set(tenant.auth)
      .send({ actualCash: 1050 })
      .expect(201);

    const today = new Date().toISOString().slice(0, 10);
    const res = await request(app.getHttpServer())
      .get(
        `/reports/cash-shifts-history?from=${today}&to=${today}&storeId=${tenant.storeId}`,
      )
      .set(tenant.auth)
      .expect(200);
    const body = res.body as CashShiftsHistoryBody;

    expect(body.shifts).toHaveLength(1);
    expect(body.shifts[0].difference).toBe(50); // 1050 declarado - 1000 esperado
  });

  it('exporta un Excel válido (.xlsx) con el resumen de ventas', async () => {
    const tenant = await registerTenant(
      'Tenant Export Excel',
      `excel-${suffix}@test.com`,
    );
    const today = new Date().toISOString().slice(0, 10);
    const res = await request(app.getHttpServer())
      .get(`/reports/export/excel?from=${today}&to=${today}&type=sales`)
      .set(tenant.auth)
      // El content-type de .xlsx no está en la lista de parsers binarios por
      // defecto de superagent — sin esto, res.body no queda como Buffer.
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);

    expect(res.headers['content-type']).toContain('spreadsheetml');
    // Todo archivo .xlsx es un zip -> arranca con la firma "PK".
    expect((res.body as Buffer).slice(0, 2).toString()).toBe('PK');
  });

  it('exporta un PDF válido con el resumen ejecutivo', async () => {
    const tenant = await registerTenant(
      'Tenant Export PDF',
      `pdf-${suffix}@test.com`,
    );
    const today = new Date().toISOString().slice(0, 10);
    const res = await request(app.getHttpServer())
      .get(`/reports/export/pdf?from=${today}&to=${today}`)
      .set(tenant.auth)
      .expect(200);

    expect(res.headers['content-type']).toBe('application/pdf');
    expect((res.body as Buffer).slice(0, 4).toString()).toBe('%PDF');
  });
});
