import {
  ProductType,
  VatCondition,
  CustomerDocType,
  CustomerTaxCondition,
  type TransactionClient,
} from '@pos/database';

// Datos de ejemplo para que un tenant demo no arranque vacío. Se llama DENTRO
// del contexto RLS ya abierto por DemoService.provision (misma tx que crea
// Tenant/Store/User), así que acá no hay que setear app.tenant_id de nuevo.
//
// Sembramos 9 productos, no cerca del tope de 20 (ver DEMO_PRODUCT_LIMIT en
// plan.service.ts): si el visitante topara el límite en su primer intento de
// cargar un producto, la demo se sentiría rota en vez de limitada.
export async function seedDemoData(
  tx: TransactionClient,
  params: { tenantId: string; storeId: string },
): Promise<void> {
  const { tenantId, storeId } = params;

  const [bebidas, almacen, accesorios] = await Promise.all([
    tx.category.create({ data: { tenantId, name: 'Bebidas' } }),
    tx.category.create({ data: { tenantId, name: 'Almacén' } }),
    tx.category.create({ data: { tenantId, name: 'Accesorios' } }),
  ]);

  const products: Array<{
    categoryId: string;
    sku: string;
    barcode: string;
    name: string;
    costPrice: number;
    price: number;
    vatCondition: VatCondition;
    stock: number;
  }> = [
    { categoryId: bebidas.id, sku: 'BEB-001', barcode: '7790895000123', name: 'Gaseosa Cola 500ml', costPrice: 900, price: 1500, vatCondition: VatCondition.IVA_21, stock: 50 },
    { categoryId: bebidas.id, sku: 'BEB-002', barcode: '7790895000456', name: 'Agua Mineral 500ml', costPrice: 400, price: 800, vatCondition: VatCondition.IVA_21, stock: 60 },
    { categoryId: bebidas.id, sku: 'BEB-003', barcode: '7790895000789', name: 'Cerveza Rubia 473ml', costPrice: 1100, price: 2000, vatCondition: VatCondition.IVA_21, stock: 40 },
    { categoryId: almacen.id, sku: 'ALM-001', barcode: '7791111000111', name: 'Yerba Mate 1kg', costPrice: 3200, price: 5200, vatCondition: VatCondition.IVA_0, stock: 25 },
    { categoryId: almacen.id, sku: 'ALM-002', barcode: '7791111000222', name: 'Café Molido 250g', costPrice: 2800, price: 4500, vatCondition: VatCondition.IVA_21, stock: 20 },
    { categoryId: almacen.id, sku: 'ALM-003', barcode: '7791111000333', name: 'Galletitas Dulces', costPrice: 700, price: 1300, vatCondition: VatCondition.IVA_21, stock: 45 },
    { categoryId: accesorios.id, sku: 'ACC-001', barcode: '7791234500011', name: 'Termo Stanley 1L', costPrice: 30000, price: 45000, vatCondition: VatCondition.IVA_21, stock: 8 },
    { categoryId: accesorios.id, sku: 'ACC-002', barcode: '7791234500028', name: 'Mate Imperial', costPrice: 5000, price: 8000, vatCondition: VatCondition.IVA_21, stock: 15 },
    { categoryId: accesorios.id, sku: 'ACC-003', barcode: '7791234500035', name: 'Bombilla de Acero', costPrice: 1800, price: 3500, vatCondition: VatCondition.IVA_21, stock: 30 },
  ];

  for (const p of products) {
    const product = await tx.product.create({
      data: {
        tenantId,
        categoryId: p.categoryId,
        sku: p.sku,
        barcode: p.barcode,
        name: p.name,
        type: ProductType.SIMPLE,
        costPrice: p.costPrice,
        price: p.price,
        vatCondition: p.vatCondition,
      },
    });
    await tx.stockLevel.create({
      data: { tenantId, storeId, productId: product.id, quantity: p.stock, minAlertStock: Math.ceil(p.stock * 0.15) },
    });
  }

  // Una caja registradora ya cargada — si no, el POS pide crear una antes de
  // poder abrir turno y vender, y eso es fricción extra en una demo de 2
  // minutos.
  await tx.cashRegister.create({
    data: { tenantId, storeId, name: 'Caja 1' },
  });

  // Dos clientes: uno consumidor final simple, y uno con CUIT/Responsable
  // Inscripto — así, cuando el visitante intente Factura A, ve el cartel
  // Premium y no un error de "falta cargar el cliente".
  await tx.customer.create({
    data: {
      tenantId,
      docType: CustomerDocType.DNI,
      docNumber: '30111222',
      name: 'Juan Pérez',
      taxCondition: CustomerTaxCondition.CONSUMIDOR_FINAL,
    },
  });
  await tx.customer.create({
    data: {
      tenantId,
      docType: CustomerDocType.CUIT,
      docNumber: '30712345678',
      name: 'Distribuidora Demo SRL',
      businessName: 'Distribuidora Demo SRL',
      taxCondition: CustomerTaxCondition.RESPONSABLE_INSCRIPTO,
    },
  });
}
