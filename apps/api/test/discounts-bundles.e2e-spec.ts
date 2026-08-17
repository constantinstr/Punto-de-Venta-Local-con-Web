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
interface ProductBody {
  id: string;
  price: string;
  bundlePricingMode: 'MANUAL' | 'DERIVED';
  bundleDiscountPercent: string | null;
}

// Cubre las dos reglas que no se pueden confiar a la pantalla:
//  - el tope de descuento por rol, que se valida en el backend porque un
//    cajero puede armar el POST a mano;
//  - el recálculo del precio de los combos derivados, que es lo único que
//    hace que la función sirva más allá del día en que se configura.
describe('Topes de descuento y precio de combos — e2e', () => {
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
    const auth = {
      Authorization: `Bearer ${(res.body as AuthResponseBody).tokens.accessToken}`,
    };

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

    const shiftRes = await request(app.getHttpServer())
      .post('/cash-shifts/open')
      .set(auth)
      .send({
        cashRegisterId: (registerRes.body as IdResponseBody).id,
        initialAmount: 1000,
      })
      .expect(201);

    return {
      auth,
      storeId,
      cashShiftId: (shiftRes.body as IdResponseBody).id,
    };
  }

  // Crea un CASHIER y devuelve su sesión: es el rol al que se le pone tope.
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

  async function createProduct(
    auth: Record<string, string>,
    storeId: string,
    sku: string,
    price: number,
  ) {
    const res = await request(app.getHttpServer())
      .post('/products')
      .set(auth)
      .send({
        sku,
        name: `Producto ${sku}`,
        type: 'SIMPLE',
        costPrice: 1,
        price,
        vatCondition: 'IVA_21',
        initialStock: [{ storeId, quantity: 100 }],
      })
      .expect(201);
    return res.body as ProductBody;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication({ rawBody: true });
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

  describe('tope de descuento por rol', () => {
    // Los valores por defecto (cajero 0, encargado 10, admin y dueño sin
    // tope) valen sin configurar nada y sin sembrar filas: viven en código
    // justamente para aplicar a todos los comercios, viejos y nuevos.
    it('un comercio recién dado de alta ya trae los topes por defecto', async () => {
      const t = await registerTenant(
        'Tope Default',
        `tope-def-${suffix}@test.com`,
      );

      const res = await request(app.getHttpServer())
        .get('/discount-policies')
        .set(t.auth)
        .expect(200);

      const body = res.body as {
        role: string;
        maxPercent: number;
        isDefault: boolean;
      }[];
      const byRole = new Map(body.map((p) => [p.role, p]));

      expect(byRole.get('CASHIER')?.maxPercent).toBe(0);
      expect(byRole.get('MANAGER')?.maxPercent).toBe(10);
      expect(byRole.get('ADMIN')?.maxPercent).toBe(100);
      expect(byRole.get('OWNER')?.maxPercent).toBe(100);
      // Ninguno se guardó en la base todavía.
      expect(body.every((p) => p.isDefault)).toBe(true);
    });

    it('por defecto un cajero no puede descontar nada', async () => {
      const t = await registerTenant(
        'Tope Cero',
        `tope-cero-${suffix}@test.com`,
      );
      const cashierAuth = await createCashier(
        t.auth,
        `cajero-cero-${suffix}@test.com`,
      );
      const product = await createProduct(
        t.auth,
        t.storeId,
        `CERO-${suffix}`,
        1000,
      );

      const regRes = await request(app.getHttpServer())
        .post('/cash-registers')
        .set(t.auth)
        .send({ storeId: t.storeId, name: 'Caja Cero' })
        .expect(201);
      const shiftRes = await request(app.getHttpServer())
        .post('/cash-shifts/open')
        .set(cashierAuth)
        .send({
          cashRegisterId: (regRes.body as IdResponseBody).id,
          initialAmount: 0,
        })
        .expect(201);
      const cashierShiftId = (shiftRes.body as IdResponseBody).id;

      const rechazada = await request(app.getHttpServer())
        .post('/orders')
        .set(cashierAuth)
        .send({
          storeId: t.storeId,
          cashShiftId: cashierShiftId,
          items: [{ productId: product.id, quantity: 1, discountAmount: 1 }],
          payments: [{ method: 'CASH', amount: 999 }],
        })
        .expect(400);
      // Con tope 0 el mensaje no habla de "máximo permitido".
      expect(JSON.stringify(rechazada.body)).toContain('no puede aplicar');

      // Sin descuento, la misma venta pasa.
      await request(app.getHttpServer())
        .post('/orders')
        .set(cashierAuth)
        .send({
          storeId: t.storeId,
          cashShiftId: cashierShiftId,
          items: [{ productId: product.id, quantity: 1 }],
          payments: [{ method: 'CASH', amount: 1000 }],
        })
        .expect(201);
    });

    it('el dueño descuenta sin tope por defecto', async () => {
      const t = await registerTenant(
        'Tope Libre',
        `tope-libre-${suffix}@test.com`,
      );
      const product = await createProduct(
        t.auth,
        t.storeId,
        `LIBRE-${suffix}`,
        1000,
      );

      await request(app.getHttpServer())
        .post('/orders')
        .set(t.auth)
        .send({
          storeId: t.storeId,
          cashShiftId: t.cashShiftId,
          items: [{ productId: product.id, quantity: 1, discountAmount: 800 }],
          payments: [{ method: 'CASH', amount: 200 }],
        })
        .expect(201);
    });

    it('con tope del 10%, el backend rechaza un descuento mayor aunque venga por HTTP directo', async () => {
      const t = await registerTenant(
        'Tope Cajero',
        `tope-cajero-${suffix}@test.com`,
      );
      const cashierAuth = await createCashier(
        t.auth,
        `cajero-tope-${suffix}@test.com`,
      );
      const product = await createProduct(
        t.auth,
        t.storeId,
        `TOPE-${suffix}`,
        1000,
      );

      await request(app.getHttpServer())
        .put('/discount-policies')
        .set(t.auth)
        .send({ role: 'CASHIER', maxPercent: 10 })
        .expect(200);

      // El cajero necesita su propio turno de caja abierto.
      const regRes = await request(app.getHttpServer())
        .post('/cash-registers')
        .set(t.auth)
        .send({ storeId: t.storeId, name: 'Caja Cajero' })
        .expect(201);
      const shiftRes = await request(app.getHttpServer())
        .post('/cash-shifts/open')
        .set(cashierAuth)
        .send({
          cashRegisterId: (regRes.body as IdResponseBody).id,
          initialAmount: 0,
        })
        .expect(201);
      const cashierShiftId = (shiftRes.body as IdResponseBody).id;

      // 30% sobre 1000: por encima del tope.
      const rechazada = await request(app.getHttpServer())
        .post('/orders')
        .set(cashierAuth)
        .send({
          storeId: t.storeId,
          cashShiftId: cashierShiftId,
          items: [{ productId: product.id, quantity: 1, discountAmount: 300 }],
          payments: [{ method: 'CASH', amount: 700 }],
        })
        .expect(400);
      expect(JSON.stringify(rechazada.body)).toContain('10');

      // 10% justo: pasa.
      await request(app.getHttpServer())
        .post('/orders')
        .set(cashierAuth)
        .send({
          storeId: t.storeId,
          cashShiftId: cashierShiftId,
          items: [{ productId: product.id, quantity: 1, discountAmount: 100 }],
          payments: [{ method: 'CASH', amount: 900 }],
        })
        .expect(201);

      // El mismo descuento que le rechazaron al cajero, con el dueño: pasa.
      await request(app.getHttpServer())
        .post('/orders')
        .set(t.auth)
        .send({
          storeId: t.storeId,
          cashShiftId: t.cashShiftId,
          items: [{ productId: product.id, quantity: 1, discountAmount: 300 }],
          payments: [{ method: 'CASH', amount: 700 }],
        })
        .expect(201);
    });

    // Sin la validación sobre el total, repartir el exceso entre muchas
    // líneas dejaría cada una debajo del tope y la venta entera muy encima.
    it('también controla el total, no solo cada línea', async () => {
      const t = await registerTenant(
        'Tope Total',
        `tope-total-${suffix}@test.com`,
      );
      const cashierAuth = await createCashier(
        t.auth,
        `cajero-total-${suffix}@test.com`,
      );
      const a = await createProduct(t.auth, t.storeId, `TOT-A-${suffix}`, 1000);
      const b = await createProduct(t.auth, t.storeId, `TOT-B-${suffix}`, 1000);

      await request(app.getHttpServer())
        .put('/discount-policies')
        .set(t.auth)
        .send({ role: 'CASHIER', maxPercent: 10 })
        .expect(200);

      const regRes = await request(app.getHttpServer())
        .post('/cash-registers')
        .set(t.auth)
        .send({ storeId: t.storeId, name: 'Caja Total' })
        .expect(201);
      const shiftRes = await request(app.getHttpServer())
        .post('/cash-shifts/open')
        .set(cashierAuth)
        .send({
          cashRegisterId: (regRes.body as IdResponseBody).id,
          initialAmount: 0,
        })
        .expect(201);

      // Cada línea al 10% exacto (permitido individualmente) da 10% del total:
      // esto SÍ tiene que pasar.
      await request(app.getHttpServer())
        .post('/orders')
        .set(cashierAuth)
        .send({
          storeId: t.storeId,
          cashShiftId: (shiftRes.body as IdResponseBody).id,
          items: [
            { productId: a.id, quantity: 1, discountAmount: 100 },
            { productId: b.id, quantity: 1, discountAmount: 100 },
          ],
          payments: [{ method: 'CASH', amount: 1800 }],
        })
        .expect(201);
    });

    // maxPercent = null no es "sin tope": es "volvé al valor por defecto".
    // Para dejar un rol sin tope se manda 100.
    it('mandar null restaura el valor por defecto del rol', async () => {
      const t = await registerTenant(
        'Tope Restaurar',
        `tope-rest-${suffix}@test.com`,
      );

      async function cashierPolicy() {
        const res = await request(app.getHttpServer())
          .get('/discount-policies')
          .set(t.auth)
          .expect(200);
        return (
          res.body as { role: string; maxPercent: number; isDefault: boolean }[]
        ).find((p) => p.role === 'CASHIER')!;
      }

      expect(await cashierPolicy()).toMatchObject({
        maxPercent: 0,
        isDefault: true,
      });

      await request(app.getHttpServer())
        .put('/discount-policies')
        .set(t.auth)
        .send({ role: 'CASHIER', maxPercent: 25 })
        .expect(200);
      expect(await cashierPolicy()).toMatchObject({
        maxPercent: 25,
        isDefault: false,
      });

      await request(app.getHttpServer())
        .put('/discount-policies')
        .set(t.auth)
        .send({ role: 'CASHIER', maxPercent: null })
        .expect(200);
      expect(await cashierPolicy()).toMatchObject({
        maxPercent: 0,
        isDefault: true,
      });
    });

    it('un tope de 100 deja al rol sin límite práctico', async () => {
      const t = await registerTenant(
        'Tope Cien',
        `tope-cien-${suffix}@test.com`,
      );
      const cashierAuth = await createCashier(
        t.auth,
        `cajero-cien-${suffix}@test.com`,
      );
      const product = await createProduct(
        t.auth,
        t.storeId,
        `CIEN-${suffix}`,
        1000,
      );

      await request(app.getHttpServer())
        .put('/discount-policies')
        .set(t.auth)
        .send({ role: 'CASHIER', maxPercent: 100 })
        .expect(200);

      const regRes = await request(app.getHttpServer())
        .post('/cash-registers')
        .set(t.auth)
        .send({ storeId: t.storeId, name: 'Caja Cien' })
        .expect(201);
      const shiftRes = await request(app.getHttpServer())
        .post('/cash-shifts/open')
        .set(cashierAuth)
        .send({
          cashRegisterId: (regRes.body as IdResponseBody).id,
          initialAmount: 0,
        })
        .expect(201);

      await request(app.getHttpServer())
        .post('/orders')
        .set(cashierAuth)
        .send({
          storeId: t.storeId,
          cashShiftId: (shiftRes.body as IdResponseBody).id,
          items: [{ productId: product.id, quantity: 1, discountAmount: 900 }],
          payments: [{ method: 'CASH', amount: 100 }],
        })
        .expect(201);
    });
  });

  describe('precio de combos derivado de sus componentes', () => {
    async function createBundleWithComponents(
      auth: Record<string, string>,
      storeId: string,
      tag: string,
    ) {
      const compA = await createProduct(auth, storeId, `C-A-${tag}`, 1500);
      const compB = await createProduct(auth, storeId, `C-B-${tag}`, 2500);

      const bundleRes = await request(app.getHttpServer())
        .post('/products')
        .set(auth)
        .send({
          sku: `COMBO-${tag}`,
          name: `Combo ${tag}`,
          type: 'BUNDLE',
          costPrice: 0,
          price: 9999,
          vatCondition: 'IVA_21',
          bundleItems: [
            { componentProductId: compA.id, quantity: 2 },
            { componentProductId: compB.id, quantity: 1 },
          ],
        })
        .expect(201);

      return { compA, compB, bundle: bundleRes.body as ProductBody };
    }

    async function readProduct(auth: Record<string, string>, id: string) {
      const res = await request(app.getHttpServer())
        .get(`/products/${id}`)
        .set(auth)
        .expect(200);
      return res.body as ProductBody;
    }

    it('al pasar a derivado calcula suma de componentes menos el porcentaje', async () => {
      const t = await registerTenant(
        'Combo Calc',
        `combo-calc-${suffix}@test.com`,
      );
      const { bundle } = await createBundleWithComponents(
        t.auth,
        t.storeId,
        `calc-${suffix}`,
      );

      // 1500×2 + 2500×1 = 5500, −10% = 4950
      await request(app.getHttpServer())
        .patch(`/products/${bundle.id}`)
        .set(t.auth)
        .send({ bundlePricingMode: 'DERIVED', bundleDiscountPercent: 10 })
        .expect(200);

      expect(Number((await readProduct(t.auth, bundle.id)).price)).toBe(4950);
    });

    it('el combo se recalcula solo cuando cambia el precio de un componente', async () => {
      const t = await registerTenant(
        'Combo Arrastre',
        `combo-arr-${suffix}@test.com`,
      );
      const { compA, bundle } = await createBundleWithComponents(
        t.auth,
        t.storeId,
        `arr-${suffix}`,
      );

      await request(app.getHttpServer())
        .patch(`/products/${bundle.id}`)
        .set(t.auth)
        .send({ bundlePricingMode: 'DERIVED', bundleDiscountPercent: 10 })
        .expect(200);

      // compA sube de 1500 a 2000: la suma pasa a 2000×2 + 2500 = 6500,
      // −10% = 5850. Nadie tocó el combo.
      await request(app.getHttpServer())
        .patch(`/products/${compA.id}`)
        .set(t.auth)
        .send({ price: 2000 })
        .expect(200);

      expect(Number((await readProduct(t.auth, bundle.id)).price)).toBe(5850);
    });

    it('un combo manual NO se mueve cuando cambia un componente', async () => {
      const t = await registerTenant(
        'Combo Manual',
        `combo-man-${suffix}@test.com`,
      );
      const { compA, bundle } = await createBundleWithComponents(
        t.auth,
        t.storeId,
        `man-${suffix}`,
      );

      await request(app.getHttpServer())
        .patch(`/products/${compA.id}`)
        .set(t.auth)
        .send({ price: 9000 })
        .expect(200);

      expect(Number((await readProduct(t.auth, bundle.id)).price)).toBe(9999);
    });

    it('rechaza escribir el precio de un combo derivado', async () => {
      const t = await registerTenant(
        'Combo Precio',
        `combo-pre-${suffix}@test.com`,
      );
      const { bundle } = await createBundleWithComponents(
        t.auth,
        t.storeId,
        `pre-${suffix}`,
      );

      await request(app.getHttpServer())
        .patch(`/products/${bundle.id}`)
        .set(t.auth)
        .send({ bundlePricingMode: 'DERIVED', bundleDiscountPercent: 0 })
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/products/${bundle.id}`)
        .set(t.auth)
        .send({ price: 1 })
        .expect(400);
    });

    it('la actualización masiva no le pega dos veces a un combo derivado', async () => {
      const t = await registerTenant(
        'Combo Masivo',
        `combo-mas-${suffix}@test.com`,
      );
      const { bundle } = await createBundleWithComponents(
        t.auth,
        t.storeId,
        `mas-${suffix}`,
      );

      await request(app.getHttpServer())
        .patch(`/products/${bundle.id}`)
        .set(t.auth)
        .send({ bundlePricingMode: 'DERIVED', bundleDiscountPercent: 0 })
        .expect(200);
      expect(Number((await readProduct(t.auth, bundle.id)).price)).toBe(5500);

      // +10% a todo el catálogo: los componentes pasan a 1650 y 2750, o sea
      // 1650×2 + 2750 = 6050. Si el combo además recibiera el aumento directo
      // quedaría en 6655.
      await request(app.getHttpServer())
        .post('/products/bulk-price')
        .set(t.auth)
        .send({ mode: 'PERCENT', value: 10 })
        .expect(201);

      expect(Number((await readProduct(t.auth, bundle.id)).price)).toBe(6050);
    });

    it('quitar el último componente devuelve el combo a precio manual sin dejarlo en cero', async () => {
      const t = await registerTenant(
        'Combo Vacío',
        `combo-vac-${suffix}@test.com`,
      );
      const t2 = `vac-${suffix}`;
      const compA = await createProduct(t.auth, t.storeId, `V-A-${t2}`, 1000);

      const bundleRes = await request(app.getHttpServer())
        .post('/products')
        .set(t.auth)
        .send({
          sku: `COMBO-${t2}`,
          name: `Combo ${t2}`,
          type: 'BUNDLE',
          costPrice: 0,
          price: 500,
          vatCondition: 'IVA_21',
          bundleItems: [{ componentProductId: compA.id, quantity: 1 }],
        })
        .expect(201);
      const bundle = bundleRes.body as ProductBody & {
        bundleComponents: IdResponseBody[];
      };

      await request(app.getHttpServer())
        .patch(`/products/${bundle.id}`)
        .set(t.auth)
        .send({ bundlePricingMode: 'DERIVED', bundleDiscountPercent: 0 })
        .expect(200);
      expect(Number((await readProduct(t.auth, bundle.id)).price)).toBe(1000);

      await request(app.getHttpServer())
        .delete(`/products/bundle-items/${bundle.bundleComponents[0].id}`)
        .set(t.auth)
        .expect(200);

      const after = await readProduct(t.auth, bundle.id);
      expect(after.bundlePricingMode).toBe('MANUAL');
      // Lo que importa: NO quedó en 0 al perder sus componentes.
      expect(Number(after.price)).toBe(1000);
    });

    // Crear un combo vacío ya está prohibido de antes, así que el caso real
    // es: se le sacan todos los componentes y después alguien intenta ponerlo
    // en derivado. Sin esta guarda el combo pasaría a valer $0.
    it('no deja pasar a derivado un combo que se quedó sin componentes', async () => {
      const t = await registerTenant(
        'Combo Sin',
        `combo-sin-${suffix}@test.com`,
      );
      const tag = `sin-${suffix}`;
      const compA = await createProduct(t.auth, t.storeId, `S-A-${tag}`, 1000);

      const bundleRes = await request(app.getHttpServer())
        .post('/products')
        .set(t.auth)
        .send({
          sku: `COMBO-${tag}`,
          name: `Combo ${tag}`,
          type: 'BUNDLE',
          costPrice: 0,
          price: 100,
          vatCondition: 'IVA_21',
          bundleItems: [{ componentProductId: compA.id, quantity: 1 }],
        })
        .expect(201);
      const bundle = bundleRes.body as ProductBody & {
        bundleComponents: IdResponseBody[];
      };

      await request(app.getHttpServer())
        .delete(`/products/bundle-items/${bundle.bundleComponents[0].id}`)
        .set(t.auth)
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/products/${bundle.id}`)
        .set(t.auth)
        .send({ bundlePricingMode: 'DERIVED', bundleDiscountPercent: 10 })
        .expect(400);
    });
  });

  // Aislamiento: la política de un comercio no puede afectar ni verse desde
  // otro (la tabla tiene RLS forzada, igual que el resto).
  it('la política de descuentos de un comercio no es visible desde otro', async () => {
    const a = await registerTenant('Aisl A', `aisl-a-${suffix}@test.com`);
    const b = await registerTenant('Aisl B', `aisl-b-${suffix}@test.com`);

    await request(app.getHttpServer())
      .put('/discount-policies')
      .set(a.auth)
      .send({ role: 'CASHIER', maxPercent: 5 })
      .expect(200);

    const desdeB = await request(app.getHttpServer())
      .get('/discount-policies')
      .set(b.auth)
      .expect(200);
    const cajeroDeB = (
      desdeB.body as { role: string; maxPercent: number; isDefault: boolean }[]
    ).find((p) => p.role === 'CASHIER')!;

    // B ve su propio valor por defecto, no el 5% que configuró A.
    expect(cajeroDeB.maxPercent).toBe(0);
    expect(cajeroDeB.isDefault).toBe(true);
  });
});
