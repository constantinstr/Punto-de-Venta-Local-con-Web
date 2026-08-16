# Sincronización bidireccional de stock — WooCommerce

Arquitectura extensible: la interfaz de sincronización se define contra un
contrato genérico (`EcommerceConnector`) para que agregar Tiendanube después
sea implementar un nuevo conector, no reescribir el pipeline.

## 1. Flujos

**POS vende → descuenta en la web:**
```
Venta confirmada en caja (transacción Prisma)
  → decremento atómico de StoreStock
  → encolar job SyncQueue { direction: POS_TO_WOO, entityType: PRODUCT_STOCK }
  → worker BullMQ consume el job
  → PUT /wp-json/wc/v3/products/{id} (stock_quantity)
  → marcar SyncQueue.status = COMPLETED | FAILED
```

**Web vende → descuenta en el POS:**
```
WooCommerce dispara webhook "order.created" / "order.updated"
  → endpoint POST /webhooks/woocommerce (NestJS) valida firma HMAC
  → encolar job SyncQueue { direction: WOO_TO_POS, entityType: ORDER }
  → worker BullMQ consume el job
  → resuelve productos por wooProductId, decremento atómico de StoreStock
  → si el pedido web se cancela: reingresa stock (job inverso)
```

Ambos caminos pasan por la **misma tabla `SyncQueue`** como bitácora e
idempotencia: nunca se llama a la API externa directamente desde el request
handler — siempre se encola, para que una caída de WooCommerce no bloquee ni
demore una venta en el mostrador.

## 2. Colas BullMQ

```ts
// apps/api/src/sync/queues.ts
import { Queue } from "bullmq";
import { redisConnection } from "../redis";

export const wooOutboundQueue = new Queue("woo-outbound", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: "exponential", delay: 5_000 }, // 5s, 10s, 20s, 40s, 80s
    removeOnComplete: 1000,
    removeOnFail: false, // los fallidos quedan para inspección manual / alerta
  },
});

export const wooInboundQueue = new Queue("woo-inbound", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: "exponential", delay: 5_000 },
  },
});
```

```ts
// apps/api/src/sync/woo-outbound.processor.ts
import { Worker } from "bullmq";
import { prisma } from "@pos/database";
import { wooClient } from "./woo-client";

export const wooOutboundWorker = new Worker(
  "woo-outbound",
  async (job) => {
    const { syncQueueId } = job.data;
    const record = await prisma.syncQueue.update({
      where: { id: syncQueueId },
      data: { status: "PROCESSING", attempts: { increment: 1 } },
    });

    if (record.entityType === "PRODUCT_STOCK") {
      const { wooProductId, quantity } = record.payload as {
        wooProductId: number;
        quantity: number;
      };
      await wooClient.put(`products/${wooProductId}`, {
        stock_quantity: quantity,
        manage_stock: true,
      });
    }

    await prisma.syncQueue.update({
      where: { id: syncQueueId },
      data: { status: "COMPLETED", processedAt: new Date() },
    });
  },
  { connection: redisConnection, concurrency: 5 },
);

wooOutboundWorker.on("failed", async (job, err) => {
  if (!job) return;
  await prisma.syncQueue.update({
    where: { id: job.data.syncQueueId },
    data: { status: "FAILED", lastError: err.message },
  });
  if (job.attemptsMade >= (job.opts.attempts ?? 1)) {
    // TODO Fase 2: notificar (email/webhook interno) — se agotaron los reintentos
  }
});
```

## 3. Webhook receptor (entrada)

```ts
// apps/api/src/sync/woo-webhook.controller.ts
import { Controller, Post, Req, Headers, HttpCode } from "@nestjs/common";
import * as crypto from "crypto";

@Controller("webhooks/woocommerce")
export class WooWebhookController {
  @Post("orders")
  @HttpCode(200) // siempre 200 rápido — WooCommerce reintenta si no responde a tiempo
  async handleOrderWebhook(
    @Req() req: RawBodyRequest,
    @Headers("x-wc-webhook-signature") signature: string,
    @Headers("x-wc-webhook-source") storeUrl: string,
  ) {
    const config = await this.wooConfigService.findBySiteUrl(storeUrl);
    const expected = crypto
      .createHmac("sha256", config.webhookSecret)
      .update(req.rawBody)
      .digest("base64");

    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      // No lanzar 401 con detalle — solo descartar silenciosamente
      return { received: false };
    }

    await this.syncQueueService.enqueueInbound({
      tenantId: config.store.tenantId,
      entityType: "ORDER",
      payload: JSON.parse(req.rawBody.toString()),
    });

    return { received: true };
  }
}
```

Puntos clave:
- **Responder rápido (200) y procesar async**: el procesamiento real pasa a
  BullMQ, nunca se hace dentro del handler del webhook — WooCommerce
  reintenta agresivamente si el endpoint tarda o falla.
- **Validación HMAC obligatoria** contra `webhookSecret` (guardado por
  tienda en `WooCommerceConfig`, no compartido entre tenants).
- **Idempotencia**: antes de aplicar un `ORDER` webhook, verificar si ya
  existe un `Order.wooOrderId` procesado (WooCommerce puede reenviar el
  mismo webhook más de una vez).

## 4. Reconciliación periódica

Además del pipeline en tiempo real, un **job programado** (BullMQ repeatable
job, cada 15-30 min) recorre productos con `wooProductId` no nulo y compara
`StoreStock.quantity` vs stock reportado por WooCommerce, para detectar y
corregir divergencias (webhook perdido, WooCommerce caído durante una venta,
etc.). Loggea diferencias > 0 como alerta operativa, no las corrige en
silencio si superan un umbral configurable (evita enmascarar bugs).

## 5. Extensibilidad a Tiendanube

```ts
interface EcommerceConnector {
  updateStock(remoteProductId: string, quantity: number): Promise<void>;
  parseInboundOrder(payload: unknown): NormalizedOrder;
  verifyWebhookSignature(rawBody: Buffer, signature: string, secret: string): boolean;
}
```

`WooCommerceConnector` implementa esta interfaz hoy; `TiendanubeConnector`
se agrega en Fase 2+ sin tocar `SyncQueue`, los workers ni el modelo de
datos — solo el mapeo de payload y auth (Tiendanube usa OAuth2, no
consumer key/secret).
