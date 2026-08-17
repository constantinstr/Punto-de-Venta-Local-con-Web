# Sincronización con Tienda Nube

Implementado en `apps/api/src/tiendanube/`. Espeja la estructura del módulo de
WooCommerce (`docs/woocommerce-sync.md`) pero **no comparte código con él**: la
decisión de unificarlos se pospuso a propósito hasta que esta integración haya
corrido contra la API real (ver "Deuda consciente" al final).

## 0. Prerrequisito fuera del código

Tienda Nube no usa credenciales que el comerciante pegue: usa OAuth 2. Hay que
registrarse como partner en [tiendanube.dev](https://tiendanube.dev), crear una
aplicación y declarar sus URLs. La app queda con un **App ID** (el
`client_id`) y un **secreto**.

En el panel de la aplicación, sección *URLs*:

| Campo del panel | Qué va |
|---|---|
| Página de la aplicación | `<APP_PUBLIC_URL>/settings/integrations/tiendanube` |
| URL para redirigir después de la instalación | `<API_PUBLIC_URL>/integrations/tiendanube/callback` |

El `code` de OAuth llega **siempre a la URL de redirección**, nunca a la página
de la aplicación. Invertir los dos campos es el error típico: la autorización
termina en el panel de Tienda Nube en vez de en el POS, y la conexión nunca se
completa.

Mientras la aplicación esté en revisión de ellos, todo el módulo funciona con
`TIENDANUBE_MOCK=true` (simulador en memoria, sin red).

## 1. Modelo de datos

- `TiendanubeConfig` (`schema.prisma`): un local (`storeId` único) ↔ una
  tienda. Guarda `tnStoreId` (el id del lado de ellos, que va en el path de
  cada ruta de su API) y el `accessToken` **cifrado con `EncryptionService`**
  (AES-256-GCM, mismo esquema que las credenciales de AFIP). A diferencia de
  `WooCommerceConfig`, **sí tiene RLS forzada** — ver §3 sobre cómo el webhook
  público resuelve el tenant sin aflojarla.
- `Product.tnProductId` / `tnVariantId` y `ProductVariant.tnProductId` /
  `tnVariantId`: el vínculo remoto. Van de a pares porque del lado de ellos
  incluso un producto "simple" tiene una variante, y la ruta de stock cuelga de
  los dos ids.
- `SyncLog`: se reutiliza el modelo de WooCommerce. Se agregaron los valores
  `OUTBOUND_TO_TIENDANUBE` / `INBOUND_FROM_TIENDANUBE` al enum `SyncDirection`
  en vez de renombrar los existentes, para no tener que reescribir las filas
  históricas ni tocar el módulo de WooCommerce.

El `accessToken` **nunca** se devuelve por la API (`SAFE_SELECT` en
`tn-config.service.ts`).

## 2. Conexión (OAuth 2)

```
Pantalla → GET /integrations/tiendanube/authorize-url?storeId=...   [autenticado]
   → devuelve https://www.tiendanube.com/apps/{APP_ID}/authorize?state=<JWT>
Comerciante autoriza en el sitio de Tienda Nube
   → GET /integrations/tiendanube/callback?code=...&state=<JWT>     [público]
       → verifica el state, canjea el code por el token (que NO vence)
       → guarda TiendanubeConfig (token cifrado)
       → registra los webhooks en la tienda (best-effort)
       → redirige a <APP_PUBLIC_URL>/settings/integrations/tiendanube
```

El `state` acá no es solo anti-CSRF: **es lo único que dice a qué comercio y a
qué local pertenece la autorización**, porque el callback llega sin sesión. Por
eso va firmado como JWT (`{ tenantId, storeId, purpose }`, TTL 15 min). El
campo `purpose` no es decorativo: el state se firma con el mismo secreto que
los tokens de sesión, así que sin esa marca alguien podría pegar su propio
access token como `state` y colgar una tienda ajena de su local.

El token de Tienda Nube no vence, pero muere si el comercio desinstala la app.
Reinstalar es normal, así que `saveFromOAuth` es un upsert.

## 3. Inbound: pedidos web → POS (webhooks)

Dos diferencias con WooCommerce que determinan el diseño:

1. **Los webhooks se dan de alta por API**, con el token de cada tienda, no
   configurando una URL en un panel. Por eso registrarlos es parte de
   "conectar" (`TnWebhookRegistrarService`), y hay un botón de re-registro para
   cuando cambia `API_PUBLIC_URL` o Tienda Nube estaba caída al conectar.
2. **La firma HMAC se calcula con el secreto de la aplicación**, que es el
   mismo para todas las tiendas instaladas — así que la firma prueba que el
   evento vino de Tienda Nube, pero **no dice de qué comercio es**. El payload
   trae `store_id`, pero es el id de ellos, no el nuestro.

La URL registrada lleva entonces un token propio firmado por nosotros:

```
POST <API_PUBLIC_URL>/webhooks/tiendanube?t=<JWT { tenantId, configId }>
```

Ese token no otorga nada por sí solo (el endpoint igual exige la firma HMAC del
body); solo dice a qué tenant pertenece el evento, que es lo que permite hacer
la consulta bajo `withTenantContext` **sin desactivar la RLS de la tabla**.
`WooCommerceConfig` quedó sin RLS forzada justamente por no tener este
mecanismo.

Verificaciones del endpoint, en orden: token presente → firma HMAC-SHA256 en
hexadecimal sobre el body crudo (header `x-linkedstore-hmac-sha256`; ojo:
WooCommerce usa base64) → JWT válido y con `purpose` correcto → el `store_id`
del payload coincide con el `tnStoreId` de la configuración → la integración
está activa y con `syncStockInbound`.

El payload de Tienda Nube es apenas `{ store_id, event, id }`: **las líneas del
pedido hay que ir a buscarlas** con `getOrder()`. Eso es red, así que el
controller solo encola y el worker resuelve el detalle.

Solo `order/paid` descuenta stock. Un pedido creado y no pagado puede no
confirmarse nunca, y comprometer stock ahí genera faltantes fantasma. El resto
de los eventos se contestan 200 y se ignoran (si no, Tienda Nube reintenta).

Igual que en WooCommerce, el descuento **permite quedar en negativo**: el
pedido web ya se cobró del otro lado, no hay forma de rechazarlo acá, y es
preferible una sobreventa visible a un stock desincronizado en silencio.

Idempotencia: se busca un `SyncLog` SUCCESS previo con el mismo `tnOrderId`
antes de gastar una llamada a su API.

## 4. Outbound: POS → Tienda Nube

```
Venta / ajuste / compra / cambio de precio
  → la tx de Postgres hace commit
  → EcommerceSyncService reparte a WooCommerce y a Tienda Nube
      → TnStockSyncService resuelve ids y encola (Redis, ms)
  → TnWorkerService → gateway.updateStock/updatePrice
```

`TnStockSyncService` **solo encola**: la llamada HTTP corre en el worker. Si
llamara al gateway en línea, cada venta pagaría la latencia de la API de Tienda
Nube aunque no pudiera fallar por eso. Y nunca lanza, por la misma razón que su
equivalente de WooCommerce.

Cola propia (`tiendanube-queue`), separada de la de WooCommerce: los límites de
rate son distintos y una tienda caída no tiene por qué frenar a la otra.

## 5. Vinculación de catálogo

`POST /tiendanube-config/sync-catalog` ata productos por **SKU**. No crea ni
modifica productos de ninguno de los dos lados: un "sincronizar catálogo" que
además crea productos es la clase de operación que, mal disparada, llena la
tienda online de duplicados sin forma cómoda de deshacerla. Lo que hace falta
para el día a día es el vínculo, para que el stock viaje.

Se recorre todo el catálogo remoto **antes** de abrir la transacción: paginar
contra su API es lento y una transacción interactiva de Prisma expira a los 5s.

## 6. Variables de entorno

| Variable | Para qué |
|---|---|
| `TIENDANUBE_CLIENT_ID` | App ID de la aplicación de partner |
| `TIENDANUBE_CLIENT_SECRET` | Canje del código **y** verificación de la firma de los webhooks |
| `TIENDANUBE_CONTACT_EMAIL` | Tienda Nube exige un `User-Agent` identificable con un mail real |
| `TIENDANUBE_MOCK` | `true` = simulador en memoria, sin red |
| `TIENDANUBE_RATE_LIMIT_PER_SEC` | Llamadas por segundo del worker (2 por defecto) |

Sin `CLIENT_ID` la pantalla informa que la integración no está habilitada en
ese servidor. Sin `CLIENT_SECRET` el endpoint de webhooks **rechaza todo**: sin
el secreto no hay forma de distinguir un webhook auténtico de uno falsificado.

## 7. Cosas de su API que no son obvias

- El header de autenticación es `Authentication: bearer <token>`, **no**
  `Authorization`. Con el header habitual devuelven 401.
- Exigen un `User-Agent` identificable con un mail de contacto.
- Los textos vienen como objeto multi-idioma (`{ es: "...", pt: "..." }`) o
  como string pelado, según el recurso.
- El SKU vive en la **variante**, no en el producto.
- `stock: null` significa "no controla stock".
- El endpoint de token es `POST https://www.tiendanube.com/apps/authorize/token`
  y devuelve el id de la tienda en `user_id`.

## 8. Tests

`apps/api/test/tiendanube.e2e-spec.ts` recorre el flujo completo contra
`TnMockGateway` (sin red, sin app de partner aprobada): OAuth → alta de
webhooks → vinculación por SKU → outbound tras una venta → inbound de un pedido
pagado → rechazo de firma inválida → integración apagada.

`tn-webhook-signature.util.spec.ts` cubre la verificación de firma, incluido
que una firma en base64 (el formato de WooCommerce) **no** pase por accidente.

## Deuda consciente

Unificar WooCommerce y Tienda Nube bajo una abstracción común es tentable, pero
significaría refactorizar código que hoy funciona y está probado para
satisfacer a una integración que todavía no corrió contra la API real. Se
decide cuando esta esté funcionando de verdad y se vea qué es genuinamente
común. Por ahora lo único compartido es `EcommerceSyncService`, un fan-out de
tres líneas que evita tener que inyectar un servicio más en
orders/stock/products/purchases cada vez que se suma un canal de venta.
