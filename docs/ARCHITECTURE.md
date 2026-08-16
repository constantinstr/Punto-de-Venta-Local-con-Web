# Arquitectura — POS SaaS Multi-tenant (Fase 1)

Plataforma SaaS de Punto de Venta Web/PWA multi-tenant, con sincronización en
tiempo real de catálogo/stock hacia tiendas online (WooCommerce primero,
Tiendanube después) y facturación electrónica AFIP nativa.

Este documento es el índice. El detalle de cada módulo vive en:

- [`docs/peripherals.md`](./peripherals.md) — lector de código de barras e impresión de tickets/A4.
- [`docs/woocommerce-sync.md`](./woocommerce-sync.md) — colas BullMQ y webhooks bidireccionales.
- [`docs/afip.md`](./afip.md) — WSAA (autenticación) y WSFE v1 (CAE) para Argentina.
- [`docs/ROADMAP.md`](./ROADMAP.md) — plan de sprints.
- [`packages/database/prisma/schema.prisma`](../packages/database/prisma/schema.prisma) — schema completo de base de datos.

---

## 1. Estructura del monorepo

Se recomienda **pnpm workspaces + Turborepo** para compartir tipos entre
frontend y backend sin duplicar el modelo de datos.

```
/
├── apps/
│   ├── pos-web/         # Next.js PWA — POS de mostrador
│   ├── api/              # NestJS — API principal (auth, ventas, catálogo, caja, reportes)
│   └── afip-worker/      # Proceso NestJS standalone o módulo dentro de api — WSAA/WSFE
├── packages/
│   ├── database/         # Prisma schema + client generado, migraciones
│   ├── shared-types/      # DTOs y tipos compartidos (Order, Product, etc.)
│   └── ui/                # Componentes Tailwind reutilizables (opcional, fase 2+)
├── prisma/
│   └── schema.prisma
├── docs/
└── turbo.json
```

`afip-worker` y el `sync-worker` de WooCommerce pueden vivir como módulos
dentro de `apps/api` inicialmente (menor complejidad operativa) y separarse a
procesos independientes cuando el volumen lo justifique — la interfaz con
BullMQ ya los deja desacoplados desde el día uno.

## 2. Multi-tenancy

Estrategia: **base de datos compartida, `tenant_id` en cada tabla** (ver
`prisma/schema.prisma`). Es el enfoque correcto para este estadio del
producto: costo operativo bajo, migraciones simples, y suficiente aislamiento
si se refuerza con:

- **Row Level Security (RLS)** en PostgreSQL como segunda barrera además del
  filtro `tenant_id` en cada query de Prisma (defensa en profundidad — un bug
  en un `where` no debe filtrar datos entre tenants).
- Middleware de NestJS que inyecta `tenantId` desde el JWT en cada request y
  lo prohíbe como parámetro de body/query (nunca confiar en tenant_id del
  cliente).
- `User.tenantId` es nullable únicamente para `role = SUPERADMIN` (staff del
  SaaS que administra tenants, billing, etc. desde un panel separado).

Migrar a esquema-por-tenant o base-por-tenant solo si un cliente grande lo
exige contractualmente (aislamiento físico) — no antes.

## 3. Concurrencia multi-caja (mismo local, mismo stock)

Dos+ cajas vendiendo el mismo producto en simultáneo es el caso de riesgo
central del negocio (vender stock que no existe). Estrategia:

1. **Decremento atómico a nivel de base**, no lectura-modificación-escritura
   desde la app:
   ```sql
   UPDATE store_stock
   SET quantity = quantity - :qty
   WHERE id = :id AND quantity >= :qty
   RETURNING quantity;
   ```
   Si `RETURNING` no devuelve fila, no había stock suficiente → la venta de
   ese ítem se rechaza o pasa a confirmación manual (venta con stock
   negativo autorizada por Encargado), nunca se descuenta en negativo por
   accidente.
2. Todo el proceso de "confirmar orden" (descuento de stock de todos los
   ítems + creación de `Order`/`OrderItem`/`Payment`) corre dentro de una
   **transacción Prisma (`$transaction`)** para que sea todo-o-nada.
3. Combos/bundles: al confirmar una venta de un producto `type = BUNDLE`, se
   resuelve su lista de `BundleItem` y se aplica el mismo decremento atómico
   a cada `componentProduct` (no al bundle en sí, que normalmente no lleva
   stock propio).
4. No se usan locks pesimistas de fila (`SELECT ... FOR UPDATE`) como
   mecanismo primario porque bloquean cajas entre sí — el `UPDATE ...
   WHERE quantity >= :qty` logra el mismo resultado sin bloqueo explícito y
   escala mejor con 2-10 cajas en LAN.
5. Frontend: `TanStack Query` con invalidación optimista sobre el stock
   local; el buffer visual se corrige apenas responde el backend. La UI
   nunca es la fuente de verdad del stock disponible.

## 4. Roles y permisos

`UserRole`: `SUPERADMIN` (SaaS, cross-tenant) → `OWNER` (dueño del comercio,
control total del tenant) → `ADMIN` (administración operativa) → `MANAGER`
(encargado de local: arqueos, descuentos, autorizaciones) → `CASHIER`
(ventas, apertura/cierre de su propio turno).

Guard de NestJS basado en decorador `@Roles(...)` + `tenantId` del JWT.
Reglas sensibles (anular venta ya facturada, dar de baja stock, cerrar caja
de otro cajero) requieren `MANAGER` o superior — no solo un rol, sino
"rol ≥ umbral para esa acción específica".

## 5. Stack y decisiones clave

| Capa | Elección | Motivo |
|---|---|---|
| Frontend | Next.js (App Router) + TS | PWA instalable, SSR opcional para catálogo inicial, ecosistema maduro |
| Estado servidor | TanStack Query | Cache + invalidación + reintentos, crítico para mostrador con conexión inestable |
| Estado cliente | Zustand | Carrito y sesión de caja: estado local simple, sin boilerplate de Redux |
| Estilos | TailwindCSS | Velocidad de desarrollo, bundle final chico → liviano en PCs de mostrador |
| Backend | NestJS + TS | Estructura modular (un módulo por dominio: sales, catalog, cash, afip, sync), DI, guards |
| DB | PostgreSQL + Prisma | Transacciones ACID (crítico para stock/caja), tipado end-to-end |
| Colas | Redis + BullMQ | Reintentos con backoff para AFIP y WooCommerce, que son servicios externos no siempre disponibles |
| Facturación | Módulo Node dedicado | AFIP exige SOAP + firma CMS; se aísla del resto de la API |

## 6. Requisito "ultra liviano en PC de mostrador"

- PWA con `next-pwa` / service worker: cachea assets estáticos y catálogo
  reciente, permite seguir vendiendo con la conexión a internet caída
  (usando cola local de IndexedDB que se sincroniza al volver la conexión —
  ver nota en `woocommerce-sync.md` sobre `SyncQueue` offline-first del lado
  cliente).
- Sin librerías de UI pesadas (nada de MUI/AntD completos); componentes
  propios sobre Tailwind + Radix Primitives solo donde haga falta
  accesibilidad (modales, comboboxes).
- Bundle del POS separado del panel de administración/reportes (rutas y
  code-splitting): la caja no debe cargar JS de reportes/Excel/PDF.
- Virtualización de listas largas de productos (`@tanstack/react-virtual`)
  para que el buscador predictivo no trabe con catálogos de miles de SKUs.

## 7. Seguridad — puntos no negociables

- Certificados AFIP (`.crt`/`.key`) y credenciales WooCommerce **nunca** en
  texto plano en DB: cifrar con KMS o al menos AES-256 con clave fuera del
  repo (env var / secret manager), aun en el MVP.
- JWT corto (15 min) + refresh token con rotación; sesión de caja
  (`CashShift`) es una entidad de negocio separada de la sesión de auth —
  cerrar sesión no cierra la caja automáticamente (para no perder el arqueo
  ante un logout accidental).
- Todas las mutaciones de stock/caja quedan auditadas (mínimo: quién, qué,
  cuándo) — no se modela una tabla `AuditLog` en la Fase 1 por alcance, pero
  queda marcado como pendiente para antes de producción.
