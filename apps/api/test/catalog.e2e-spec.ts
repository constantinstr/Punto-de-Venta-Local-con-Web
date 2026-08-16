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
interface StockRow {
  productId: string | null;
  variantId: string | null;
  quantity: number;
}

// Corre contra la base de datos real local (Postgres + Redis levantados en
// Sprint 0) — no mockea Prisma. Deja datos de prueba en la DB, igual que
// las pruebas manuales hechas durante el desarrollo; no se limpia porque
// borrar un Tenant en cascada no está modelado (FKs en RESTRICT) y esto es
// una base de dev/CI descartable, nunca producción.
describe('Catálogo (Sprint 2) — e2e', () => {
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
    const { accessToken } = (res.body as AuthResponseBody).tokens;

    const storesRes = await request(app.getHttpServer())
      .get('/stores')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const stores = storesRes.body as IdResponseBody[];

    return { token: accessToken, storeId: stores[0].id };
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

  describe('Aislamiento multi-tenant', () => {
    it('un tenant no ve el catálogo de otro tenant', async () => {
      const tenantA = await registerTenant(
        'Tenant Aislamiento A',
        `iso-a-${suffix}@test.com`,
      );
      const tenantB = await registerTenant(
        'Tenant Aislamiento B',
        `iso-b-${suffix}@test.com`,
      );

      const categoryRes = await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', `Bearer ${tenantA.token}`)
        .send({ name: 'Solo de A' })
        .expect(201);
      const category = categoryRes.body as IdResponseBody;

      const productRes = await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${tenantA.token}`)
        .send({
          categoryId: category.id,
          sku: `ISO-${suffix}`,
          name: 'Producto solo de A',
          type: 'SIMPLE',
          costPrice: 100,
          price: 200,
          vatCondition: 'IVA_21',
        })
        .expect(201);
      const product = productRes.body as IdResponseBody;

      // B no ve nada de A en los listados...
      const bCategories = await request(app.getHttpServer())
        .get('/categories')
        .set('Authorization', `Bearer ${tenantB.token}`)
        .expect(200);
      expect(bCategories.body).toHaveLength(0);

      const bProducts = await request(app.getHttpServer())
        .get('/products')
        .set('Authorization', `Bearer ${tenantB.token}`)
        .expect(200);
      expect(bProducts.body).toHaveLength(0);

      // ...ni accediendo directo por id del recurso de A.
      await request(app.getHttpServer())
        .get(`/products/${product.id}`)
        .set('Authorization', `Bearer ${tenantB.token}`)
        .expect(404);

      // A sí lo ve.
      const aProducts = await request(app.getHttpServer())
        .get('/products')
        .set('Authorization', `Bearer ${tenantA.token}`)
        .expect(200);
      expect(aProducts.body).toHaveLength(1);
    });
  });

  describe('Stock virtual de combos', () => {
    it('el stock disponible del combo es el mínimo de floor(componente/cantidad)', async () => {
      const tenant = await registerTenant(
        'Tenant Combos',
        `combo-${suffix}@test.com`,
      );
      const auth = { Authorization: `Bearer ${tenant.token}` };

      const termoRes = await request(app.getHttpServer())
        .post('/products')
        .set(auth)
        .send({
          sku: `TERMO-${suffix}`,
          name: 'Termo Test',
          type: 'SIMPLE',
          costPrice: 100,
          price: 200,
          vatCondition: 'IVA_21',
          initialStock: [{ storeId: tenant.storeId, quantity: 10 }],
        })
        .expect(201);
      const termo = termoRes.body as IdResponseBody;

      const bombillaRes = await request(app.getHttpServer())
        .post('/products')
        .set(auth)
        .send({
          sku: `BOMB-${suffix}`,
          name: 'Bombilla Test',
          type: 'SIMPLE',
          costPrice: 50,
          price: 100,
          vatCondition: 'IVA_21',
          // Con 2 bombillas requeridas por combo: floor(30/2) = 15
          initialStock: [{ storeId: tenant.storeId, quantity: 30 }],
        })
        .expect(201);
      const bombilla = bombillaRes.body as IdResponseBody;

      const comboRes = await request(app.getHttpServer())
        .post('/products')
        .set(auth)
        .send({
          sku: `COMBO-${suffix}`,
          name: 'Combo Test',
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
      const combo = comboRes.body as IdResponseBody;

      // min(floor(10/1), floor(30/2)) = min(10, 15) = 10
      const stockList1 = await request(app.getHttpServer())
        .get(`/stock?storeId=${tenant.storeId}`)
        .set(auth)
        .expect(200);
      const rows1 = stockList1.body as StockRow[];
      const comboRow1 = rows1.find((r) => r.productId === combo.id);
      expect(comboRow1?.quantity).toBe(10);

      // Bajamos el termo a 3 -> min(floor(3/1), floor(30/2)) = min(3, 15) = 3
      await request(app.getHttpServer())
        .post('/stock/adjust')
        .set(auth)
        .send({
          storeId: tenant.storeId,
          productId: termo.id,
          absoluteQuantity: 3,
          reason: 'test',
        })
        .expect(201);

      const stockList2 = await request(app.getHttpServer())
        .get(`/stock?storeId=${tenant.storeId}`)
        .set(auth)
        .expect(200);
      const rows2 = stockList2.body as StockRow[];
      const comboRow2 = rows2.find((r) => r.productId === combo.id);
      expect(comboRow2?.quantity).toBe(3);
    });

    it('rechaza combos vacíos y variantes con código de barras a nivel producto', async () => {
      const tenant = await registerTenant(
        'Tenant Validaciones',
        `valid-${suffix}@test.com`,
      );
      const auth = { Authorization: `Bearer ${tenant.token}` };

      await request(app.getHttpServer())
        .post('/products')
        .set(auth)
        .send({
          sku: `EMPTY-${suffix}`,
          name: 'Combo vacío',
          type: 'BUNDLE',
          costPrice: 0,
          price: 100,
          vatCondition: 'IVA_21',
          bundleItems: [],
        })
        .expect(400);

      await request(app.getHttpServer())
        .post('/products')
        .set(auth)
        .send({
          sku: `VARBC-${suffix}`,
          name: 'Variable con barcode',
          type: 'VARIABLE',
          costPrice: 0,
          price: 100,
          vatCondition: 'IVA_21',
          barcode: '123456',
          variants: [{ sku: `VARBC-${suffix}-A`, attributes: { talle: 'M' } }],
        })
        .expect(400);
    });
  });

  describe('Buscador de mostrador (pos-search)', () => {
    it('devuelve barcode, vatCondition y productType del producto (no solo de la variante)', async () => {
      const tenant = await registerTenant(
        'Tenant PosSearch',
        `possearch-${suffix}@test.com`,
      );
      const auth = { Authorization: `Bearer ${tenant.token}` };

      const productRes = await request(app.getHttpServer())
        .post('/products')
        .set(auth)
        .send({
          sku: `PS-${suffix}`,
          name: 'Producto Pos Search',
          barcode: `PS-BARCODE-${suffix}`,
          type: 'SIMPLE',
          costPrice: 50,
          price: 100,
          vatCondition: 'EXENTO',
          initialStock: [{ storeId: tenant.storeId, quantity: 7 }],
        })
        .expect(201);
      const product = productRes.body as IdResponseBody;

      const searchRes = await request(app.getHttpServer())
        .get(
          `/products/pos-search?q=PS-BARCODE-${suffix}&storeId=${tenant.storeId}`,
        )
        .set(auth)
        .expect(200);
      const [result] = searchRes.body as {
        productId: string;
        barcode: string | null;
        vatCondition: string;
        productType: string;
        availableStock: number;
      }[];

      expect(result.productId).toBe(product.id);
      expect(result.barcode).toBe(`PS-BARCODE-${suffix}`);
      expect(result.vatCondition).toBe('EXENTO');
      expect(result.productType).toBe('SIMPLE');
      expect(result.availableStock).toBe(7);
    });
  });
});
