import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { Queue } from 'bullmq';
import { getRedisConnection } from '../redis/redis-connection';

// Mismo criterio que getWooQueueName(): configurable por env var para que
// los distintos *.e2e-spec.ts (procesos separados de Jest, mismo Redis) no
// se roben jobs entre sí.
export function getTnQueueName(): string {
  return process.env.TIENDANUBE_QUEUE_NAME ?? 'tiendanube-queue';
}

// Los ids remotos son de Tienda Nube y siempre van de a pares: incluso un
// producto simple tiene una variante del lado de ellos, y la ruta de stock
// cuelga de los dos.
export interface TnStockOutboundJobData {
  syncLogId: string;
  tenantId: string;
  configId: string;
  tnProductId: number;
  tnVariantId: number;
  quantity: number;
}

export interface TnPriceOutboundJobData {
  syncLogId: string;
  tenantId: string;
  configId: string;
  tnProductId: number;
  tnVariantId: number;
  price: number;
}

// A diferencia de WooCommerce, el webhook de Tienda Nube NO trae las líneas
// del pedido: solo `{ store_id, event, id }`. El detalle hay que ir a
// buscarlo con getOrder(), y eso es una llamada de red — por eso el job
// guarda el id y el worker resuelve el resto.
export interface TnOrderInboundJobData {
  syncLogId: string;
  tenantId: string;
  configId: string;
  tnOrderId: number;
  event: string;
}

export type TnJobData =
  TnStockOutboundJobData | TnPriceOutboundJobData | TnOrderInboundJobData;

// Cola propia, separada de la de WooCommerce: los límites de rate son
// distintos y una tienda de WooCommerce caída no tiene por qué frenar la
// sincronización de Tienda Nube (ni al revés).
@Injectable()
export class TnQueueService implements OnApplicationShutdown {
  readonly queue = new Queue<TnJobData>(getTnQueueName(), {
    connection: getRedisConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 500,
      removeOnFail: false,
    },
  });

  addStockOutbound(data: TnStockOutboundJobData) {
    return this.queue.add('stock-outbound', data);
  }

  addPriceOutbound(data: TnPriceOutboundJobData) {
    return this.queue.add('price-outbound', data);
  }

  addOrderInbound(data: TnOrderInboundJobData) {
    return this.queue.add('order-inbound', data);
  }

  async onApplicationShutdown() {
    await this.queue.close();
  }
}
