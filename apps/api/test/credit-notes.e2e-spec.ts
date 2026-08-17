import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { AFIP_GATEWAY } from '../src/afip/afip-gateway.interface';
import { AfipMockGateway } from '../src/afip/afip-mock.gateway';

interface AuthResponseBody {
  tokens: { accessToken: string };
}
interface IdResponseBody {
  id: string;
}
interface InvoiceResponseBody {
  id: string;
  invoiceType: string;
  status: string;
  cbteNro: number | null;
  cae: string | null;
  afipQrUrl: string | null;
  total: string;
}
interface OrderResponseBody {
  id: string;
  status: string;
  invoices?: { id: string; invoiceType: string; cae: string | null }[];
}
interface StockRow {
  productId: string | null;
  quantity: number;
}
interface ShiftSummaryBody {
  cashSalesTotal: number;
  expectedCash: number;
}

// Ciclo de anulación de una venta FACTURADA: pedirle la nota de crédito a
// AFIP, reingresar el stock y dejar la orden cancelada. El AFIP_GATEWAY real
// se reemplaza por AfipMockGateway — no se toca la red ni hacen falta
// certificados.
describe('Notas de crédito / anulación de venta facturada — e2e', () => {
  let app: INestApplication<App>;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  async function setupTenant(name: string, email: string) {
    const res = await request(app.getHttpServer())
      .post('/auth/register-tenant')
      .send({
        tenantName: `${name} ${suffix}`,
        storeName: 'Local NC',
        ownerFullName: 'Owner NC',
        ownerEmail: email,
        ownerPassword: 'password123',
      })
      .expect(201);
    const { accessToken } = (res.body as AuthResponseBody).tokens;
    const auth = { Authorization: `Bearer ${accessToken}` };

    const stores = await request(app.getHttpServer())
      .get('/stores')
      .set(auth)
      .expect(200);
    const storeId = (stores.body as IdResponseBody[])[0].id;

    const reg = await request(app.getHttpServer())
      .post('/cash-registers')
      .set(auth)
      .send({ storeId, name: 'Caja NC' })
      .expect(201);

    const shift = await request(app.getHttpServer())
      .post('/cash-shifts/open')
      .set(auth)
      .send({
        cashRegisterId: (reg.body as IdResponseBody).id,
        initialAmount: 0,
      })
      .expect(201);

    return {
      auth,
      storeId,
      cashShiftId: (shift.body as IdResponseBody).id,
    };
  }

  async function createFiscalConfig(
    auth: Record<string, string>,
    storeId: string,
    taxCondition: 'MONOTRIBUTO' | 'RESPONSABLE_INSCRIPTO',
    ptoVta: number,
  ) {
    await request(app.getHttpServer())
      .post('/fiscal-config')
      .set(auth)
      .send({
        storeId,
        cuit: '20304050607',
        taxCondition,
        ptoVta,
        crtCertificate:
          '-----BEGIN CERTIFICATE-----\nMOCK\n-----END CERTIFICATE-----',
        keyCertificate:
          '-----BEGIN PRIVATE KEY-----\nMOCK\n-----END PRIVATE KEY-----',
        isProduction: false,
      })
      .expect(201);
  }

  async function createProduct(
    auth: Record<string, string>,
    storeId: string,
    price: number,
    stock: number,
  ) {
    const res = await request(app.getHttpServer())
      .post('/products')
      .set(auth)
      .send({
        sku: `SKU-NC-${suffix}-${Math.random().toString(36).slice(2, 8)}`,
        name: 'Producto NC',
        type: 'SIMPLE',
        costPrice: price / 2,
        price,
        vatCondition: 'IVA_21',
        initialStock: [{ storeId, quantity: stock }],
      })
      .expect(201);
    return (res.body as IdResponseBody).id;
  }

  async function stockOf(
    auth: Record<string, string>,
    storeId: string,
    productId: string,
  ): Promise<number> {
    const res = await request(app.getHttpServer())
      .get(`/stock?storeId=${storeId}`)
      .set(auth)
      .expect(200);
    const row = (res.body as StockRow[]).find((r) => r.productId === productId);
    return row?.quantity ?? 0;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AFIP_GATEWAY)
      .useClass(AfipMockGateway)
      .compile();
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

  it('anular una venta con Factura C emite la Nota de Crédito C, reingresa el stock y descuenta del arqueo', async () => {
    const t = await setupTenant('NC Monotributo', `nc-c-${suffix}@test.com`);
    await createFiscalConfig(t.auth, t.storeId, 'MONOTRIBUTO', 4);
    const productId = await createProduct(t.auth, t.storeId, 1000, 10);

    const orderRes = await request(app.getHttpServer())
      .post('/orders')
      .set(t.auth)
      .send({
        storeId: t.storeId,
        cashShiftId: t.cashShiftId,
        items: [{ productId, quantity: 3 }],
        payments: [{ method: 'CASH', amount: 3000 }],
      })
      .expect(201);
    const orderId = (orderRes.body as OrderResponseBody).id;

    expect(await stockOf(t.auth, t.storeId, productId)).toBe(7);

    const facturaRes = await request(app.getHttpServer())
      .post('/invoices')
      .set(t.auth)
      .send({ orderId, requestedType: 'FACTURA_B' }) // Monotributo -> C
      .expect(201);
    const factura = facturaRes.body as InvoiceResponseBody;
    expect(factura.invoiceType).toBe('FACTURA_C');
    expect(factura.cae).not.toBeNull();

    // El arqueo, antes de anular, cuenta la venta.
    const antes = await request(app.getHttpServer())
      .get(`/cash-shifts/${t.cashShiftId}/summary`)
      .set(t.auth)
      .expect(200);
    expect((antes.body as ShiftSummaryBody).cashSalesTotal).toBe(3000);

    // ── anulación ──────────────────────────────────────────────────────────
    const cancelRes = await request(app.getHttpServer())
      .post(`/orders/${orderId}/cancel`)
      .set(t.auth)
      .send({ reason: 'cliente se arrepintió' })
      .expect(201);
    expect((cancelRes.body as OrderResponseBody).status).toBe('CANCELLED');

    // Se emitió la NC del tipo correcto y con su propio CAE.
    const detalle = await request(app.getHttpServer())
      .get(`/orders/${orderId}`)
      .set(t.auth)
      .expect(200);
    const invoices = (detalle.body as OrderResponseBody).invoices ?? [];
    expect(invoices).toHaveLength(2);

    const nc = invoices.find((i) => i.invoiceType === 'NOTA_CREDITO_C');
    expect(nc).toBeDefined();
    expect(nc!.cae).not.toBeNull();
    // La factura original NO se toca: sigue existiendo y autorizada.
    expect(invoices.some((i) => i.invoiceType === 'FACTURA_C')).toBe(true);

    // El stock volvió.
    expect(await stockOf(t.auth, t.storeId, productId)).toBe(10);

    // El arqueo dejó de contar la venta anulada, sin necesidad de un
    // CashMovement de egreso (computeCashSalesTotal excluye las canceladas).
    const despues = await request(app.getHttpServer())
      .get(`/cash-shifts/${t.cashShiftId}/summary`)
      .set(t.auth)
      .expect(200);
    expect((despues.body as ShiftSummaryBody).cashSalesTotal).toBe(0);
    expect((despues.body as ShiftSummaryBody).expectedCash).toBe(0);
  });

  it('anular una venta con Factura A emite Nota de Crédito A', async () => {
    const t = await setupTenant('NC Resp Insc', `nc-a-${suffix}@test.com`);
    await createFiscalConfig(t.auth, t.storeId, 'RESPONSABLE_INSCRIPTO', 5);
    const productId = await createProduct(t.auth, t.storeId, 500, 5);

    const customerRes = await request(app.getHttpServer())
      .post('/customers')
      .set(t.auth)
      .send({
        name: 'Cliente RI',
        docType: 'CUIT',
        docNumber: '30712345678',
        taxCondition: 'RESPONSABLE_INSCRIPTO',
      })
      .expect(201);

    const orderRes = await request(app.getHttpServer())
      .post('/orders')
      .set(t.auth)
      .send({
        storeId: t.storeId,
        cashShiftId: t.cashShiftId,
        items: [{ productId, quantity: 1 }],
        payments: [{ method: 'CASH', amount: 500 }],
      })
      .expect(201);
    const orderId = (orderRes.body as OrderResponseBody).id;

    const facturaRes = await request(app.getHttpServer())
      .post('/invoices')
      .set(t.auth)
      .send({
        orderId,
        requestedType: 'FACTURA_A',
        customerId: (customerRes.body as IdResponseBody).id,
      })
      .expect(201);
    expect((facturaRes.body as InvoiceResponseBody).invoiceType).toBe(
      'FACTURA_A',
    );

    await request(app.getHttpServer())
      .post(`/orders/${orderId}/cancel`)
      .set(t.auth)
      .send({ reason: 'error de facturación' })
      .expect(201);

    const detalle = await request(app.getHttpServer())
      .get(`/orders/${orderId}`)
      .set(t.auth)
      .expect(200);
    const invoices = (detalle.body as OrderResponseBody).invoices ?? [];
    expect(invoices.some((i) => i.invoiceType === 'NOTA_CREDITO_A')).toBe(true);
  });

  it('anular una venta con Ticket X no emite nota de crédito (no es fiscal)', async () => {
    const t = await setupTenant('NC Ticket X', `nc-tx-${suffix}@test.com`);
    const productId = await createProduct(t.auth, t.storeId, 200, 4);

    const orderRes = await request(app.getHttpServer())
      .post('/orders')
      .set(t.auth)
      .send({
        storeId: t.storeId,
        cashShiftId: t.cashShiftId,
        items: [{ productId, quantity: 2 }],
        payments: [{ method: 'CASH', amount: 400 }],
      })
      .expect(201);
    const orderId = (orderRes.body as OrderResponseBody).id;

    await request(app.getHttpServer())
      .post('/invoices')
      .set(t.auth)
      .send({ orderId, requestedType: 'TICKET_X' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/orders/${orderId}/cancel`)
      .set(t.auth)
      .send({ reason: 'prueba ticket interno' })
      .expect(201);

    const detalle = await request(app.getHttpServer())
      .get(`/orders/${orderId}`)
      .set(t.auth)
      .expect(200);
    const invoices = (detalle.body as OrderResponseBody).invoices ?? [];
    // Solo el ticket original: un comprobante interno se anula sin AFIP.
    expect(invoices).toHaveLength(1);
    expect(invoices[0].invoiceType).toBe('TICKET_X');
    expect(await stockOf(t.auth, t.storeId, productId)).toBe(4);
  });

  it('no permite anular dos veces la misma venta facturada', async () => {
    const t = await setupTenant('NC Doble', `nc-doble-${suffix}@test.com`);
    await createFiscalConfig(t.auth, t.storeId, 'MONOTRIBUTO', 6);
    const productId = await createProduct(t.auth, t.storeId, 100, 3);

    const orderRes = await request(app.getHttpServer())
      .post('/orders')
      .set(t.auth)
      .send({
        storeId: t.storeId,
        cashShiftId: t.cashShiftId,
        items: [{ productId, quantity: 1 }],
        payments: [{ method: 'CASH', amount: 100 }],
      })
      .expect(201);
    const orderId = (orderRes.body as OrderResponseBody).id;

    await request(app.getHttpServer())
      .post('/invoices')
      .set(t.auth)
      .send({ orderId, requestedType: 'FACTURA_B' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/orders/${orderId}/cancel`)
      .set(t.auth)
      .send({ reason: 'primera' })
      .expect(201);

    // La segunda tiene que rebotar ANTES de pedirle otra NC a AFIP.
    await request(app.getHttpServer())
      .post(`/orders/${orderId}/cancel`)
      .set(t.auth)
      .send({ reason: 'segunda' })
      .expect(400);

    const detalle = await request(app.getHttpServer())
      .get(`/orders/${orderId}`)
      .set(t.auth)
      .expect(200);
    const invoices = (detalle.body as OrderResponseBody).invoices ?? [];
    // Una sola NC, no dos.
    expect(
      invoices.filter((i) => i.invoiceType === 'NOTA_CREDITO_C'),
    ).toHaveLength(1);
    // Y el stock volvió una sola vez.
    expect(await stockOf(t.auth, t.storeId, productId)).toBe(3);
  });
});
