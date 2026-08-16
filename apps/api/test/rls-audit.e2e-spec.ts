import { prisma } from '@pos/database';

interface RlsRow {
  tablename: string;
  rowsecurity: boolean; // relrowsecurity — RLS habilitada
  forcerowsecurity: boolean; // relforcerowsecurity — se aplica también al dueño de la tabla
}

// Auditoría de seguridad (Sprint 9): confirma contra el catálogo real de
// Postgres —no contra lo que dice cada archivo de migración por separado—
// que toda tabla con datos de negocio propios de un tenant tiene
// FORCE ROW LEVEL SECURITY activa. Corre contra la base real (no un mock),
// a propósito: es exactamente el estado que importa auditar.
describe('Auditoría RLS (Sprint 9)', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  // Toda tabla que tiene su propia columna tenantId y sirve datos de
  // negocio del tenant (ventas, cajas, catálogo, fiscal, sync) — ver
  // schema.prisma. No incluye: BundleItem/OrderItemBundleComponent (no
  // tienen tenantId propio, heredan aislamiento vía FK a Product/OrderItem,
  // que sí están protegidos) ni RefreshToken/WooCommerceConfig (excepciones
  // documentadas — ver comentarios en schema.prisma).
  const EXPECTED_PROTECTED_TABLES = [
    'Tenant',
    'User',
    'Store',
    'Category',
    'Product',
    'ProductVariant',
    'StockLevel',
    'Customer',
    'CashRegister',
    'CashShift',
    'CashMovement',
    'Order',
    'OrderItem',
    'Payment',
    'Invoice',
    'FiscalConfig',
    'SyncLog',
  ];

  it('todas las tablas de negocio tenant-scoped tienen FORCE ROW LEVEL SECURITY activa', async () => {
    const rows = await prisma.$queryRaw<RlsRow[]>`
      SELECT c.relname as tablename, c.relrowsecurity as rowsecurity, c.relforcerowsecurity as forcerowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
    `;
    const byName = new Map(rows.map((r) => [r.tablename, r]));

    const missing: string[] = [];
    const notForced: string[] = [];
    for (const table of EXPECTED_PROTECTED_TABLES) {
      const row = byName.get(table);
      if (!row) {
        missing.push(table);
        continue;
      }
      if (!row.rowsecurity || !row.forcerowsecurity) {
        notForced.push(table);
      }
    }

    expect({ missing, notForced }).toEqual({ missing: [], notForced: [] });
  });

  it('toda tabla protegida tiene al menos una policy de aislamiento por tenantId', async () => {
    const rows = await prisma.$queryRaw<
      { tablename: string; policyname: string }[]
    >`
      SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public'
    `;
    const tablesWithPolicy = new Set(rows.map((r) => r.tablename));

    const withoutPolicy = EXPECTED_PROTECTED_TABLES.filter(
      (t) => !tablesWithPolicy.has(t),
    );
    expect(withoutPolicy).toEqual([]);
  });
});
