// Seed de datos de prueba (Sprint 2 — catálogo, variantes, combos, stock).
// Idempotente: si el tenant demo ya existe, no hace nada.
//
// Uso: pnpm --filter @pos/database exec prisma db seed
import * as bcrypt from "bcrypt";
import { prisma, ProductType, VatCondition, UserRole } from "../src/index";

const DEMO_TENANT_SLUG = "demo-almacen";
const BCRYPT_ROUNDS = 12;

async function main() {
  const existing = await prisma.tenant.findUnique({ where: { slug: DEMO_TENANT_SLUG } });
  if (existing) {
    console.log(`El tenant demo ("${DEMO_TENANT_SLUG}") ya existe (id=${existing.id}) — nada que sembrar.`);
    return;
  }

  await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: { name: "Almacén Demo", slug: DEMO_TENANT_SLUG },
    });

    // Las tablas del catálogo tienen FORCE ROW LEVEL SECURITY — hay que
    // setear la sesión igual que en AuthService.registerTenant.
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenant.id}, true)`;

    const store = await tx.store.create({ data: { tenantId: tenant.id, name: "Local Demo" } });

    const [ownerHash, cashierHash] = await Promise.all([
      bcrypt.hash("demo12345", BCRYPT_ROUNDS),
      bcrypt.hash("cajero1234", BCRYPT_ROUNDS),
    ]);
    await tx.user.create({
      data: {
        tenantId: tenant.id,
        email: "demo@pos.test",
        passwordHash: ownerHash,
        fullName: "Dueño Demo",
        role: UserRole.OWNER,
      },
    });
    await tx.user.create({
      data: {
        tenantId: tenant.id,
        email: "cajero@pos.test",
        passwordHash: cashierHash,
        fullName: "Cajero Demo",
        role: UserRole.CASHIER,
      },
    });

    const bebidas = await tx.category.create({ data: { tenantId: tenant.id, name: "Bebidas" } });
    const accesorios = await tx.category.create({ data: { tenantId: tenant.id, name: "Accesorios" } });

    // Producto simple
    const gaseosa = await tx.product.create({
      data: {
        tenantId: tenant.id,
        categoryId: bebidas.id,
        sku: "BEB-001",
        barcode: "7790895000123",
        name: "Gaseosa Cola 500ml",
        type: ProductType.SIMPLE,
        costPrice: 900,
        price: 1500,
        vatCondition: VatCondition.IVA_21,
      },
    });
    await tx.stockLevel.create({
      data: { tenantId: tenant.id, storeId: store.id, productId: gaseosa.id, quantity: 50, minAlertStock: 10 },
    });

    const termo = await tx.product.create({
      data: {
        tenantId: tenant.id,
        categoryId: accesorios.id,
        sku: "ACC-001",
        barcode: "7791234500011",
        name: "Termo Stanley 1L",
        type: ProductType.SIMPLE,
        costPrice: 30000,
        price: 45000,
        vatCondition: VatCondition.IVA_21,
      },
    });
    await tx.stockLevel.create({
      data: { tenantId: tenant.id, storeId: store.id, productId: termo.id, quantity: 10, minAlertStock: 3 },
    });

    const bombilla = await tx.product.create({
      data: {
        tenantId: tenant.id,
        categoryId: accesorios.id,
        sku: "ACC-002",
        barcode: "7791234500028",
        name: "Bombilla de Acero",
        type: ProductType.SIMPLE,
        costPrice: 1800,
        price: 3500,
        vatCondition: VatCondition.IVA_21,
      },
    });
    await tx.stockLevel.create({
      data: { tenantId: tenant.id, storeId: store.id, productId: bombilla.id, quantity: 30, minAlertStock: 5 },
    });

    // Producto variable: 3 colores de mate
    const mate = await tx.product.create({
      data: {
        tenantId: tenant.id,
        categoryId: accesorios.id,
        sku: "ACC-003",
        name: "Mate Imperial",
        type: ProductType.VARIABLE,
        costPrice: 5000,
        price: 8000,
        vatCondition: VatCondition.IVA_21,
      },
    });
    const mateVerde = await tx.productVariant.create({
      data: {
        tenantId: tenant.id,
        productId: mate.id,
        sku: "ACC-003-VERDE",
        barcode: "7791234500035",
        attributes: { color: "Verde" },
      },
    });
    await tx.stockLevel.create({
      data: { tenantId: tenant.id, storeId: store.id, variantId: mateVerde.id, quantity: 8, minAlertStock: 2 },
    });

    const mateNegro = await tx.productVariant.create({
      data: {
        tenantId: tenant.id,
        productId: mate.id,
        sku: "ACC-003-NEGRO",
        barcode: "7791234500042",
        attributes: { color: "Negro" },
      },
    });
    await tx.stockLevel.create({
      data: { tenantId: tenant.id, storeId: store.id, variantId: mateNegro.id, quantity: 5, minAlertStock: 2 },
    });

    const mateMarron = await tx.productVariant.create({
      data: {
        tenantId: tenant.id,
        productId: mate.id,
        sku: "ACC-003-MARRON",
        barcode: "7791234500059",
        attributes: { color: "Marrón" },
      },
    });
    // Sin stock a propósito: sirve para probar el listado de stock bajo.
    await tx.stockLevel.create({
      data: { tenantId: tenant.id, storeId: store.id, variantId: mateMarron.id, quantity: 0, minAlertStock: 2 },
    });

    // Combo: Termo + Mate (variante Verde) + Bombilla, con descuento sobre
    // la suma de componentes (45000 + 8000 + 3500 = 56500 -> 52000).
    const combo = await tx.product.create({
      data: {
        tenantId: tenant.id,
        categoryId: accesorios.id,
        sku: "COMBO-001",
        barcode: "7791234509999",
        name: "Set Mate Completo (Termo + Mate + Bombilla)",
        type: ProductType.BUNDLE,
        costPrice: 36800,
        price: 52000,
        vatCondition: VatCondition.IVA_21,
        trackStock: false,
      },
    });
    await tx.bundleItem.createMany({
      data: [
        { bundleProductId: combo.id, componentProductId: termo.id, quantity: 1 },
        { bundleProductId: combo.id, componentProductId: bombilla.id, quantity: 1 },
        { bundleProductId: combo.id, componentProductId: mate.id, componentVariantId: mateVerde.id, quantity: 1 },
      ],
    });

    console.log(`Sembrado OK — tenant "${tenant.name}" (${tenant.id}), local "${store.name}" (${store.id}).`);
    console.log(`Login: demo@pos.test / demo12345 (OWNER) — cajero@pos.test / cajero1234 (CASHIER)`);
    console.log(`Combo "${combo.name}" disponible = min(stock Termo, stock Bombilla, stock Mate Verde) = 8 unidades.`);
  });
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
