import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { Queue } from 'bullmq';
import { getRedisConnection } from '../redis/redis-connection';

// Configurable por env var (WOO_QUEUE_NAME) — todos los procesos que
// comparten el mismo Redis (incluidos los distintos archivos *.e2e-spec.ts,
// que Jest corre en procesos separados en paralelo) compiten por los jobs
// de una cola con el mismo nombre. Los tests e2e de este módulo fijan un
// nombre único por corrida para no robarle jobs a — ni que le roben jobs
// de — otros *.e2e-spec.ts que también bootstrapean AppModule completo.
export function getWooQueueName(): string {
  return process.env.WOO_QUEUE_NAME ?? 'woocommerce-queue';
}

export interface StockOutboundJobData {
  syncLogId: string;
  tenantId: string;
  configId: string;
  // wooProductId es siempre el id del producto padre en WooCommerce (para
  // un producto simple es el suyo propio; para una variante, el del
  // producto variable dueño). wooVariantId solo está presente cuando el
  // ítem sincronizado es una variante — la REST API de WooCommerce anida
  // el endpoint de variación bajo su producto padre.
  wooProductId: number;
  wooVariantId?: number;
  quantity: number;
}

export interface WcOrderLineItem {
  product_id: number;
  variation_id: number;
  quantity: number;
  sku?: string;
}

export interface PriceOutboundJobData {
  syncLogId: string;
  tenantId: string;
  configId: string;
  wooProductId: number;
  wooVariantId?: number;
  price: number;
}

export interface OrderInboundJobData {
  syncLogId: string;
  tenantId: string;
  configId: string;
  wcOrder: {
    id: number;
    status: string;
    line_items: WcOrderLineItem[];
  };
}

export type WooJobData =
  StockOutboundJobData | PriceOutboundJobData | OrderInboundJobData;

// Cola única "woocommerce-queue" para ambos sentidos (outbound stock,
// inbound orders) — separa la sincronización del ciclo transaccional del
// POS: una venta de mostrador nunca espera la respuesta HTTP de
// WooCommerce, solo el `queue.add()` (Redis, milisegundos). 3 reintentos
// con backoff exponencial: hostings compartidos de WordPress se caen o
// tardan seguido, no tiene sentido reintentar agresivo ni descartar al
// primer fallo.
@Injectable()
export class WooQueueService implements OnApplicationShutdown {
  readonly queue = new Queue<WooJobData>(getWooQueueName(), {
    connection: getRedisConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 500,
      removeOnFail: false,
    },
  });

  addStockOutbound(data: StockOutboundJobData) {
    return this.queue.add('stock-outbound', data);
  }

  addPriceOutbound(data: PriceOutboundJobData) {
    return this.queue.add('price-outbound', data);
  }

  addOrderInbound(data: OrderInboundJobData) {
    return this.queue.add('order-inbound', data);
  }

  async onApplicationShutdown() {
    await this.queue.close();
  }
}
