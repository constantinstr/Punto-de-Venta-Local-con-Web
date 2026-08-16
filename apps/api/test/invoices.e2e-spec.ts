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
interface ProductResponseBody {
  id: string;
}
interface OrderResponseBody {
  id: string;
}
interface InvoiceResponseBody {
  id: string;
  invoiceType: string;
  status: string;
  ptoVta: number;
  cbteNro: number | null;
  cae: string | null;
  caeVto: string | null;
  afipQrUrl: string | null;
  errorMessage: string | null;
  total: string;
}

// Corre contra la base de datos real local, igual que los demás e2e-spec de
// este proyecto. El AFIP_GATEWAY real (SOAP) se reemplaza acá por
// AfipMockGateway vía overrideProvider — nunca se toca la red ni se
// requieren certificados reales de AFIP para correr esta suite.
describe('Invoices / AFIP (Sprint 6) — e2e', () => {
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

    return { auth, storeId, cashRegisterId, cashShiftId };
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
        sku: `SKU-INV-${suffix}-${Math.random().toString(36).slice(2, 8)}`,
        name: 'Producto Factura Test',
        type: 'SIMPLE',
        costPrice: price / 2,
        price,
        vatCondition: 'IVA_21',
        initialStock: [{ storeId, quantity: stock }],
      })
      .expect(201);
    return res.body as ProductResponseBody;
  }

  async function createCompletedOrder(
    auth: Record<string, string>,
    storeId: string,
    cashShiftId: string,
    price: number,
  ) {
    const product = await createSimpleProduct(auth, storeId, price, 10);
    const orderRes = await request(app.getHttpServer())
      .post('/orders')
      .set(auth)
      .send({
        storeId,
        cashShiftId,
        items: [{ productId: product.id, quantity: 1 }],
        payments: [{ method: 'CASH', amount: price }],
      })
      .expect(201);
    return (orderRes.body as OrderResponseBody).id;
  }

  async function createFiscalConfig(
    auth: Record<string, string>,
    storeId: string,
    taxCondition: 'MONOTRIBUTO' | 'RESPONSABLE_INSCRIPTO' | 'EXENTO',
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

  async function createCustomer(
    auth: Record<string, string>,
    overrides: Record<string, unknown>,
  ) {
    const res = await request(app.getHttpServer())
      .post('/customers')
      .set(auth)
      .send({ name: 'Cliente Test', ...overrides })
      .expect(201);
    return res.body as IdResponseBody;
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

  it('emite un Ticket X con numeración local secuencial, sin necesitar configuración fiscal', async () => {
    const tenant = await registerTenantWithOpenShift(
      'Tenant Ticket X',
      `ticket-x-${suffix}@test.com`,
    );
    const orderId1 = await createCompletedOrder(
      tenant.auth,
      tenant.storeId,
      tenant.cashShiftId,
      100,
    );
    const orderId2 = await createCompletedOrder(
      tenant.auth,
      tenant.storeId,
      tenant.cashShiftId,
      200,
    );

    const inv1 = await request(app.getHttpServer())
      .post('/invoices')
      .set(tenant.auth)
      .send({ orderId: orderId1, requestedType: 'TICKET_X' })
      .expect(201);
    const inv2 = await request(app.getHttpServer())
      .post('/invoices')
      .set(tenant.auth)
      .send({ orderId: orderId2 }) // requestedType omitido -> también Ticket X
      .expect(201);

    const body1 = inv1.body as InvoiceResponseBody;
    const body2 = inv2.body as InvoiceResponseBody;
    expect(body1.invoiceType).toBe('TICKET_X');
    expect(body1.status).toBe('ISSUED');
    expect(body1.ptoVta).toBe(0);
    expect(body1.cae).toBeNull();
    expect(body2.cbteNro).toBe((body1.cbteNro ?? 0) + 1);
  });

  it('emisor Responsable Inscripto + cliente Responsable Inscripto con CUIT -> Factura A con CAE y QR válido', async () => {
    const tenant = await registerTenantWithOpenShift(
      'Tenant Factura A',
      `factura-a-${suffix}@test.com`,
    );
    await createFiscalConfig(
      tenant.auth,
      tenant.storeId,
      'RESPONSABLE_INSCRIPTO',
      1,
    );
    const customer = await createCustomer(tenant.auth, {
      docType: 'CUIT',
      docNumber: '30712345678',
      taxCondition: 'RESPONSABLE_INSCRIPTO',
      businessName: 'Cliente RI SA',
    });
    const orderId = await createCompletedOrder(
      tenant.auth,
      tenant.storeId,
      tenant.cashShiftId,
      1000,
    );

    const res = await request(app.getHttpServer())
      .post('/invoices')
      .set(tenant.auth)
      .send({ orderId, customerId: customer.id, requestedType: 'FACTURA_A' })
      .expect(201);
    const invoice = res.body as InvoiceResponseBody;

    expect(invoice.invoiceType).toBe('FACTURA_A');
    expect(invoice.status).toBe('ISSUED');
    expect(invoice.ptoVta).toBe(1);
    expect(invoice.cbteNro).toBe(1);
    expect(invoice.cae).toMatch(/^MOCK/);
    expect(invoice.caeVto).not.toBeNull();
    expect(invoice.afipQrUrl).toContain('https://www.afip.gob.ar/fe/qr/?p=');

    const qrPayload = JSON.parse(
      Buffer.from(
        new URL(invoice.afipQrUrl as string).searchParams.get('p') as string,
        'base64',
      ).toString('utf8'),
    ) as { cuit: number; tipoCmp: number; nroCmp: number; importe: number };
    expect(qrPayload.cuit).toBe(20304050607);
    expect(qrPayload.tipoCmp).toBe(1); // Factura A
    expect(qrPayload.nroCmp).toBe(1);
    expect(qrPayload.importe).toBe(1000);
  });

  it('emisor Responsable Inscripto + sin cliente (consumidor final) -> Factura B', async () => {
    const tenant = await registerTenantWithOpenShift(
      'Tenant Factura B',
      `factura-b-${suffix}@test.com`,
    );
    await createFiscalConfig(
      tenant.auth,
      tenant.storeId,
      'RESPONSABLE_INSCRIPTO',
      2,
    );
    const orderId = await createCompletedOrder(
      tenant.auth,
      tenant.storeId,
      tenant.cashShiftId,
      500,
    );

    const res = await request(app.getHttpServer())
      .post('/invoices')
      .set(tenant.auth)
      .send({ orderId, requestedType: 'FACTURA_B' })
      .expect(201);
    const invoice = res.body as InvoiceResponseBody;

    expect(invoice.invoiceType).toBe('FACTURA_B');
    expect(invoice.status).toBe('ISSUED');
    expect(invoice.cae).toMatch(/^MOCK/);
  });

  it('emisor Monotributo siempre emite Factura C, sin importar lo pedido por el cajero', async () => {
    const tenant = await registerTenantWithOpenShift(
      'Tenant Factura C',
      `factura-c-${suffix}@test.com`,
    );
    await createFiscalConfig(tenant.auth, tenant.storeId, 'MONOTRIBUTO', 3);
    const customer = await createCustomer(tenant.auth, {
      docType: 'CUIT',
      docNumber: '30799999999',
      taxCondition: 'RESPONSABLE_INSCRIPTO',
    });
    const orderId = await createCompletedOrder(
      tenant.auth,
      tenant.storeId,
      tenant.cashShiftId,
      300,
    );

    const res = await request(app.getHttpServer())
      .post('/invoices')
      .set(tenant.auth)
      // Se pide Factura B a propósito -> el server debe ignorarlo y emitir C.
      .send({ orderId, customerId: customer.id, requestedType: 'FACTURA_B' })
      .expect(201);
    const invoice = res.body as InvoiceResponseBody;

    expect(invoice.invoiceType).toBe('FACTURA_C');
    expect(invoice.status).toBe('ISSUED');
  });

  it('rechaza pedir Factura A a un emisor Monotributo con un mensaje claro', async () => {
    const tenant = await registerTenantWithOpenShift(
      'Tenant Rechazo Monotributo',
      `rechazo-mono-${suffix}@test.com`,
    );
    await createFiscalConfig(tenant.auth, tenant.storeId, 'MONOTRIBUTO', 4);
    const customer = await createCustomer(tenant.auth, {
      docType: 'CUIT',
      docNumber: '30799999999',
      taxCondition: 'RESPONSABLE_INSCRIPTO',
    });
    const orderId = await createCompletedOrder(
      tenant.auth,
      tenant.storeId,
      tenant.cashShiftId,
      300,
    );

    await request(app.getHttpServer())
      .post('/invoices')
      .set(tenant.auth)
      .send({ orderId, customerId: customer.id, requestedType: 'FACTURA_A' })
      .expect(400);
  });

  it('rechaza Factura A sin cliente Responsable Inscripto con CUIT', async () => {
    const tenant = await registerTenantWithOpenShift(
      'Tenant Rechazo Sin CUIT',
      `rechazo-cuit-${suffix}@test.com`,
    );
    await createFiscalConfig(
      tenant.auth,
      tenant.storeId,
      'RESPONSABLE_INSCRIPTO',
      5,
    );
    const orderId = await createCompletedOrder(
      tenant.auth,
      tenant.storeId,
      tenant.cashShiftId,
      300,
    );

    // Sin customerId -> no hay CUIT posible.
    await request(app.getHttpServer())
      .post('/invoices')
      .set(tenant.auth)
      .send({ orderId, requestedType: 'FACTURA_A' })
      .expect(400);
  });

  it('persiste un comprobante REJECTED con el motivo cuando AFIP rechaza la solicitud', async () => {
    const tenant = await registerTenantWithOpenShift(
      'Tenant Rechazo AFIP',
      `rechazo-afip-${suffix}@test.com`,
    );
    await createFiscalConfig(
      tenant.auth,
      tenant.storeId,
      'RESPONSABLE_INSCRIPTO',
      6,
    );
    // docNumber 11111111 es el valor mágico que AfipMockGateway usa para
    // simular un rechazo real de WSFE (ver FORCE_REJECT_DOC_NRO).
    const customer = await createCustomer(tenant.auth, {
      docType: 'CUIT',
      docNumber: '11111111',
      taxCondition: 'RESPONSABLE_INSCRIPTO',
    });
    const orderId = await createCompletedOrder(
      tenant.auth,
      tenant.storeId,
      tenant.cashShiftId,
      400,
    );

    const res = await request(app.getHttpServer())
      .post('/invoices')
      .set(tenant.auth)
      .send({ orderId, customerId: customer.id, requestedType: 'FACTURA_A' })
      .expect(201);
    const invoice = res.body as InvoiceResponseBody;

    expect(invoice.status).toBe('REJECTED');
    expect(invoice.cae).toBeNull();
    expect(invoice.errorMessage).toContain('10015');
  });

  it('no permite emitir dos comprobantes para la misma orden', async () => {
    const tenant = await registerTenantWithOpenShift(
      'Tenant Doble Factura',
      `doble-factura-${suffix}@test.com`,
    );
    const orderId = await createCompletedOrder(
      tenant.auth,
      tenant.storeId,
      tenant.cashShiftId,
      150,
    );

    await request(app.getHttpServer())
      .post('/invoices')
      .set(tenant.auth)
      .send({ orderId, requestedType: 'TICKET_X' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/invoices')
      .set(tenant.auth)
      .send({ orderId, requestedType: 'TICKET_X' })
      .expect(409);
  });

  it('permite recuperar el comprobante emitido a partir del orderId', async () => {
    const tenant = await registerTenantWithOpenShift(
      'Tenant Consulta Factura',
      `consulta-factura-${suffix}@test.com`,
    );
    const orderId = await createCompletedOrder(
      tenant.auth,
      tenant.storeId,
      tenant.cashShiftId,
      250,
    );
    const created = await request(app.getHttpServer())
      .post('/invoices')
      .set(tenant.auth)
      .send({ orderId, requestedType: 'TICKET_X' })
      .expect(201);
    const createdBody = created.body as InvoiceResponseBody;

    const res = await request(app.getHttpServer())
      .get(`/invoices/by-order/${orderId}`)
      .set(tenant.auth)
      .expect(200);
    const found = res.body as InvoiceResponseBody;

    expect(found.id).toBe(createdBody.id);
  });
});
