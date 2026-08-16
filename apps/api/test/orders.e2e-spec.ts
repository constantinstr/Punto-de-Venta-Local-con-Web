import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

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
interface StockRow {
  productId: string | null;
  variantId: string | null;
  quantity: number;
}
interface OrderResponseBody {
  id: string;
  orderNumber: number;
  total: string;
  status: string;
  items: { id: string; quantity: string }[];
}

// Corre contra la base de datos real local, igual que los demás e2e-spec de
// este proyecto — no se limpia después (dev/CI descartable, nunca prod).
describe('Orders (Sprint 5) — e2e', () => {
  let app: INestApplication<App>;
  const suffix = Date.now();

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

    return { token: accessToken, auth, storeId, cashRegisterId, cashShiftId };
  }

  async function createSimpleProduct(
    auth: Record<string, string>,
    storeId: string,
    price: number,
    stock: number,
  ) {
    const res = await request(app.getHttpServer())
      .post('/products')
      .set(auth)
      .send({
        sku: `SKU-${suffix}-${Math.random().toString(36).slice(2, 8)}`,
        name: 'Producto Orden Test',
        type: 'SIMPLE',
        costPrice: price / 2,
        price,
        vatCondition: 'IVA_21',
        initialStock: [{ storeId, quantity: stock }],
      })
      .expect(201);
    return res.body as ProductResponseBody;
  }

  async function getStockRow(
    auth: Record<string, string>,
    storeId: string,
    productId: string,
  ) {
    const res = await request(app.getHttpServer())
      .get(`/stock?storeId=${storeId}`)
      .set(auth)
      .expect(200);
    const rows = res.body as StockRow[];
    return rows.find((r) => r.productId === productId);
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

  it('vende un producto simple y descuenta el stock exacto', async () => {
    const tenant = await registerTenantWithOpenShift(
      'Tenant Venta Simple',
      `venta-simple-${suffix}@test.com`,
    );
    const product = await createSimpleProduct(
      tenant.auth,
      tenant.storeId,
      500,
      10,
    );

    const orderRes = await request(app.getHttpServer())
      .post('/orders')
      .set(tenant.auth)
      .send({
        storeId: tenant.storeId,
        cashShiftId: tenant.cashShiftId,
        items: [{ productId: product.id, quantity: 3 }],
        payments: [{ method: 'CASH', amount: 1500 }],
      })
      .expect(201);
    const order = orderRes.body as OrderResponseBody;

    expect(order.status).toBe('COMPLETED');
    expect(Number(order.total)).toBe(1500);
    expect(order.items).toHaveLength(1);

    const stockRow = await getStockRow(tenant.auth, tenant.storeId, product.id);
    expect(stockRow?.quantity).toBe(7); // 10 - 3
  });

  it('vende un combo y descuenta proporcionalmente todos sus componentes', async () => {
    const tenant = await registerTenantWithOpenShift(
      'Tenant Venta Combo',
      `venta-combo-${suffix}@test.com`,
    );

    const termo = await createSimpleProduct(
      tenant.auth,
      tenant.storeId,
      200,
      10,
    );
    const bombilla = await createSimpleProduct(
      tenant.auth,
      tenant.storeId,
      100,
      30,
    );

    const comboRes = await request(app.getHttpServer())
      .post('/products')
      .set(tenant.auth)
      .send({
        sku: `COMBO-${suffix}`,
        name: 'Combo Orden Test',
        type: 'BUNDLE',
        costPrice: 250,
        price: 350,
        vatCondition: 'IVA_21',
        bundleItems: [
          { componentProductId: termo.id, quantity: 1 },
          { componentProductId: bombilla.id, quantity: 2 },
        ],
      })
      .expect(201);
    const combo = comboRes.body as ProductResponseBody;

    // Vendemos 2 combos -> termo -2, bombilla -4
    await request(app.getHttpServer())
      .post('/orders')
      .set(tenant.auth)
      .send({
        storeId: tenant.storeId,
        cashShiftId: tenant.cashShiftId,
        items: [{ productId: combo.id, quantity: 2 }],
        payments: [{ method: 'CASH', amount: 700 }],
      })
      .expect(201);

    const termoStock = await getStockRow(tenant.auth, tenant.storeId, termo.id);
    const bombillaStock = await getStockRow(
      tenant.auth,
      tenant.storeId,
      bombilla.id,
    );
    expect(termoStock?.quantity).toBe(8); // 10 - 2*1
    expect(bombillaStock?.quantity).toBe(26); // 30 - 2*2
  });

  it('rechaza la venta por stock insuficiente sin dejar cambios parciales (rollback total)', async () => {
    const tenant = await registerTenantWithOpenShift(
      'Tenant Rollback',
      `rollback-${suffix}@test.com`,
    );

    const sufficientProduct = await createSimpleProduct(
      tenant.auth,
      tenant.storeId,
      100,
      100,
    );
    const insufficientProduct = await createSimpleProduct(
      tenant.auth,
      tenant.storeId,
      100,
      2,
    );

    // sufficientProduct va primero para que si el rollback no funcionara,
    // quedaría con stock ya descontado cuando insufficientProduct frena todo.
    await request(app.getHttpServer())
      .post('/orders')
      .set(tenant.auth)
      .send({
        storeId: tenant.storeId,
        cashShiftId: tenant.cashShiftId,
        items: [
          { productId: sufficientProduct.id, quantity: 1 },
          { productId: insufficientProduct.id, quantity: 5 }, // solo hay 2
        ],
        payments: [{ method: 'CASH', amount: 10000 }],
      })
      .expect(400);

    const sufficientStock = await getStockRow(
      tenant.auth,
      tenant.storeId,
      sufficientProduct.id,
    );
    const insufficientStock = await getStockRow(
      tenant.auth,
      tenant.storeId,
      insufficientProduct.id,
    );
    expect(sufficientStock?.quantity ?? 100).toBe(100); // sin tocar
    expect(insufficientStock?.quantity ?? 2).toBe(2); // sin tocar

    const ordersRes = await request(app.getHttpServer())
      .get(`/orders?storeId=${tenant.storeId}`)
      .set(tenant.auth)
      .expect(200);
    const { data } = ordersRes.body as { data: unknown[] };
    expect(data).toHaveLength(0); // no quedó ninguna orden huérfana
  });

  it('el cobro en efectivo actualiza expectedCash del turno en tiempo real', async () => {
    const tenant = await registerTenantWithOpenShift(
      'Tenant Cash Impact',
      `cash-impact-${suffix}@test.com`,
    );
    const product = await createSimpleProduct(
      tenant.auth,
      tenant.storeId,
      300,
      20,
    );

    const before = await request(app.getHttpServer())
      .get(`/cash-shifts/${tenant.cashShiftId}/summary`)
      .set(tenant.auth)
      .expect(200);
    expect((before.body as { expectedCash: number }).expectedCash).toBe(1000); // solo el fondo inicial

    // Paga con $1000 en efectivo un total de $600 -> $400 de vuelto; el
    // cajón solo debería ganar netos $600, no $1000.
    await request(app.getHttpServer())
      .post('/orders')
      .set(tenant.auth)
      .send({
        storeId: tenant.storeId,
        cashShiftId: tenant.cashShiftId,
        items: [{ productId: product.id, quantity: 2 }],
        payments: [{ method: 'CASH', amount: 1000 }],
      })
      .expect(201);

    const after = await request(app.getHttpServer())
      .get(`/cash-shifts/${tenant.cashShiftId}/summary`)
      .set(tenant.auth)
      .expect(200);
    const summary = after.body as {
      expectedCash: number;
      cashSalesTotal: number;
    };
    expect(summary.cashSalesTotal).toBe(600);
    expect(summary.expectedCash).toBe(1600); // 1000 fondo + 600 neto de la venta
  });
});
