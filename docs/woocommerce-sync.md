# Sincronización bidireccional de stock — WooCommerce (Sprint 7)

Implementado en `apps/api/src/woocommerce/`. Cola BullMQ + Redis para no
bloquear el ciclo transaccional del POS con la latencia/disponibilidad de
WooCommerce, y `SyncLog` (Postgres) como bitácora de auditoría — la cola en
sí vive en Redis, no en la base.

## 1. Modelo de datos

- `WooCommerceConfig` (`schema.prisma`): credenciales + flags por local
  (`storeId` único). `tenantId` está denormalizado para filtrar explícito en
  cada query, pero **no tiene RLS forzada** — el webhook público necesita
  resolver esta fila por `id` sin conocer el tenant de antemano (ver
  comentario en el modelo). `consumerKey`/`consumerSecret`/`webhookSecret`
  nunca se devuelven por API una vez guardados (mismo criterio que
  `FiscalConfig`).
- `Product.wooProductId` / `ProductVariant.wooVariantId`: id remoto en
  WooCommerce. `wooSyncStatus` (`SYNCED`/`PENDING`/`ERROR`/`IGNORED`) +
  `wooLastSyncAt` para trazabilidad visual (badge en el catálogo).
- `SyncLog`: una fila por evento de sincronización (`entityType`:
  `PRODUCT`/`STOCK`/`ORDER`, `direction`: `OUTBOUND_TO_WOO`/
  `INBOUND_FROM_WOO`, `status`: `PENDING`/`SUCCESS`/`FAILED`). Se crea en
  PENDING al encolar el job de BullMQ, el worker la cierra en SUCCESS/FAILED.
  El `payload` de las filas STOCK/ORDER incluye `configId`, lo que permite
  reintentar (`POST /integrations/woocommerce/sync-logs/:id/retry`) sin
  volver a resolver nada.

## 2. Outbound: POS → WooCommerce

```
Venta confirmada (OrdersService.create) o ajuste manual (StockService.adjust)
  → tx de Postgres hace commit (stock ya descontado)
  → WooStockSyncService.enqueueStockSync(...)  [fuera de la tx a propósito]
      → busca WooCommerceConfig activa + syncStockOutbound=true del local
      → por cada producto/variante con wooProductId/wooVariantId:
          crea SyncLog PENDING, encola job "stock-outbound"
  → WooWorkerService procesa el job → WooGateway.updateStock(...)
      → PUT /wp-json/wc/v3/products/{id} (o .../variations/{id})
      → SyncLog → SUCCESS | FAILED (reintenta con backoff exponencial)
```

Si el producto vendido es un `BUNDLE`, no se sincroniza el combo (no tiene
`wooProductId` propio en este diseño) sino cada componente descontado.

`enqueueStockSync` nunca lanza: un fallo acá (Redis caído, Woo inactivo)
jamás debe poder tumbar una venta de mostrador ya confirmada — solo loggea.

## 3. Inbound: WooCommerce → POS (webhooks)

```
WooCommerce dispara order.created / order.updated
  → POST /webhooks/woocommerce/orders?configId=<id>  (sin JWT)
  → valida x-wc-webhook-signature (HMAC-SHA256 sobre el body crudo,
    ver webhook-signature.util.ts) contra el webhookSecret de esa config
  → responde 401 si la firma no matchea, 200 rápido si matchea
  → solo status processing/completed: crea SyncLog PENDING + encola
    "order-inbound"
  → WooWorkerService: idempotencia (busca un SyncLog SUCCESS previo con el
    mismo wooOrderId en el payload) → si ya se procesó, no vuelve a tocar
    stock; si no, resuelve cada line_item por wooProductId/wooVariantId y
    descuenta StockLevel de la sucursal asignada a esa config — incluso en
    negativo (una orden web ya pagada no se puede "rechazar" del lado POS;
    un negativo es sobreventa real que hay que resolver operativamente, no
    algo para esconder fallando en silencio)
```

`configId` en la URL —no un header ni el dominio de origen— es lo que
identifica tenant + local: es la misma URL que se muestra en
`/settings/integrations/woocommerce` para pegar en WooCommerce → Ajustes →
Avanzado → Webhooks. `rawBody: true` en `main.ts` es necesario para poder
validar el HMAC contra los bytes exactos que WooCommerce firmó.

## 4. Importación / vinculación inicial de catálogo

`POST /integrations/woocommerce/sync-catalog` (`WooCatalogSyncService`):
pagina `GET /products` de WooCommerce y por cada producto:

- Empareja por SKU exacto contra `sku` **o** `barcode` local (WooCommerce no
  trae un campo "barcode" propio en su REST API estándar — muchas tiendas
  chicas usan su SKU para eso).
- Si matchea: setea `wooProductId`/`wooSyncStatus=SYNCED`/`wooLastSyncAt`.
- Si no matchea y es tipo `simple`: crea un producto `SIMPLE` nuevo en el
  POS con esos datos.
- Los productos `variable` sin match local se cuentan como "omitidos" —
  auto-crear la estructura completa de variantes/atributos desde cero queda
  fuera de este sprint; si ya existen localmente, sus variaciones también se
  emparejan por SKU.

## 5. Cola BullMQ

Una sola cola `woocommerce-queue` (nombre configurable vía
`WOO_QUEUE_NAME` — los tests e2e la aíslan con un nombre único por corrida
para no competir por jobs con el worker de otro `*.e2e-spec.ts` que también
bootstrapea `AppModule` completo) para ambos sentidos, jobs `stock-outbound`
y `order-inbound`. 3 reintentos con backoff exponencial (2s, 4s, 8s) y un
rate limiter configurable (`WOO_RATE_LIMIT_PER_SEC`, default 5/s) para no
saturar hostings compartidos de WordPress.

## 6. Mock y tests

`WooMockGateway` (activable con `WOO_MOCK=true`, o inyectado directo vía
`overrideProvider(WOO_GATEWAY)` en tests — mismo patrón que `AfipMockGateway`
en Sprint 6) simula la REST API de WooCommerce sin tocar la red y expone
`recordedUpdates` para verificar qué se le "mandó" a WooCommerce. Ver
`apps/api/test/woocommerce.e2e-spec.ts`: firma HMAC válida/inválida, flujo
outbound completo (venta → job → mock recibe el PUT), flujo inbound completo
(webhook → job → stock local descontado) con verificación de idempotencia
ante reenvíos, y "probar conexión".

## 7. Extensibilidad a otras plataformas

`WooGateway` (`woo-gateway.interface.ts`) es la única superficie que sabe
hablar HTTP con WooCommerce específicamente — `WooStockSyncService`,
`WooCatalogSyncService` y `WooWorkerService` no conocen detalles de su REST
API. Un conector para otra plataforma (Tiendanube, etc.) implementaría la
misma interfaz sin tocar colas, `SyncLog` ni el modelo de datos.
