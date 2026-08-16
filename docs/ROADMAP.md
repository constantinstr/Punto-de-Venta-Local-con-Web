# Roadmap de ejecución

Sprints de referencia (~2 semanas cada uno, ajustable), pensados para
desarrollo solo/en equipo chico programando componente por componente con
asistencia de Claude Sonnet. Cada sprint deja el sistema en un estado
demostrable, no solo código suelto.

## Sprint 0 — Fundaciones
- Monorepo (pnpm + Turborepo), `apps/pos-web`, `apps/api`, `packages/database`.
- Prisma + PostgreSQL local (Docker Compose), primera migración desde `schema.prisma`.
- Redis + BullMQ levantado en Docker Compose, cola "hello world" funcionando end-to-end.
- CI mínimo: lint + typecheck + build, aplicando `prisma migrate deploy` contra un Postgres de servicio en el runner (ver `.github/workflows/ci.yml`).
- **Entregable**: `docker compose up` levanta DB + Redis + API + web, todo tipado end-to-end.

## Sprint 1 — Auth, tenants y roles
- Módulo `auth` NestJS: login, JWT + refresh, guard de `tenantId`.
- CRUD de `Tenant`, `Store`, `User` con `UserRole`.
- Middleware que inyecta `tenantId` en cada request y RLS en Postgres.
- Panel mínimo de login en `pos-web`.
- **Entregable**: un OWNER puede crear su tenant, su primer local y un cajero.

## Sprint 2 — Catálogo
- CRUD de `Category` (jerárquico), `Product`, `ProductVariant`.
- `StoreStock` por local, carga manual e import CSV inicial.
- `BundleItem` — armado de combos y su resolución de componentes.
- Buscador predictivo por SKU/nombre/código de barras (backend: índice
  `tenantId+barcode`, `tenantId+sku`; frontend: debounce + TanStack Query).
- **Entregable**: catálogo completo cargable y buscable, sin ventas todavía.

## Sprint 3 — POS UI y carrito
- Layout de venta: navegación por categorías, buscador, carrito con Zustand.
- Hook `useBarcodeScanner` (ver `docs/peripherals.md`) integrado al carrito.
- Descuentos por ítem/subtotal (porcentaje y monto fijo).
- Resolución de combos al agregar al carrito (descuento de componentes visible antes de confirmar).
- **Entregable**: se arma un carrito completo con scanner, pero sin cobrar aún.

## Sprint 4 — Caja
- `CashRegister`, `CashShift` (apertura/cierre X/Z), `CashMovement`.
- Reglas de concurrencia multi-caja (`UPDATE ... WHERE quantity >= :qty`, ver `docs/ARCHITECTURE.md` §3).
- Arqueo intermedio y reporte de cierre por turno/cajero.
- **Entregable**: dos cajas abiertas en simultáneo en LAN, sin pisarse el stock.

## Sprint 5 — Cobro y comprobante interno
- `Payment` con medios combinados (efectivo + tarjeta, por ejemplo).
- Confirmación de `Order` en transacción (stock + caja + pagos atómico).
- Impresión de ticket térmico 58/80mm y modo "Ticket interno / Remito X" (sin CAE).
- **Entregable**: venta de punta a punta con ticket impreso, sin AFIP todavía.

## Sprint 6 — AFIP (WSAA + WSFE)
- Módulo `afip-worker`: `signTra`, `getValidAccessTicket`, `requestCae` (ver `docs/afip.md`).
- Alta de `AfipCredential` por local (certificado, ambiente homologación primero).
- Cola `afip-cae` con reintentos; pantalla de comprobantes pendientes/con error.
- QR fiscal + impresión de Factura A4 completa.
- **Entregable**: Factura B con CAE real emitida en homologación AFIP.

## Sprint 7 — Sincronización WooCommerce
- `WooCommerceConfig` por local, conector `EcommerceConnector` (ver `docs/woocommerce-sync.md`).
- Cola `woo-outbound` (venta en mostrador → stock en la web).
- Webhook receptor + cola `woo-inbound` (venta online → stock en el POS).
- Job de reconciliación periódica.
- **Entregable**: vender el mismo SKU en mostrador y en la web sin vender stock duplicado.

## Sprint 8 — Administración y reportes
- Reportes de ventas por rango, márgenes, ranking de productos, desglose por medio de pago.
- Exportación a Excel/PDF.
- Panel de roles/permisos y gestión de usuarios por tenant.
- **Entregable**: dueño puede auditar el negocio sin tocar la base de datos.

## Sprint 9 — Endurecimiento
- Cifrado real de credenciales AFIP/WooCommerce (KMS o AES-256 con secret manager).
- `AuditLog` para mutaciones de stock/caja/anulaciones.
- Modo offline del POS (IndexedDB + cola local que reintenta al reconectar).
- Pruebas de carga: 2-4 cajas concurrentes contra el mismo SKU, validar que nunca hay stock negativo no autorizado.
- **Entregable**: sistema listo para el primer cliente real en producción.

## Sprint 10 — Onboarding SaaS
- Alta de tenant self-service (o asistida), planes/billing básico.
- Wizard de configuración: local, punto de venta AFIP, credenciales WooCommerce.
- Manual de instalación de PC de mostrador (Chrome `--kiosk-printing`, impresora predeterminada).
- **Entregable**: se puede dar de alta un comercio nuevo sin intervención manual en la base de datos.

---

**Cómo trabajar cada sprint con Claude Sonnet**: abrir un sprint por vez,
referenciar el doc de módulo correspondiente (`docs/afip.md`,
`docs/woocommerce-sync.md`, `docs/peripherals.md`) como contexto, y pedir
implementación de un componente concreto por sesión (un módulo NestJS, un
hook, un endpoint) en vez de "implementar el sprint completo" — mantiene el
diff revisable y evita que el diseño de esta Fase 1 se desvíe sin que quede
registrado por qué.
