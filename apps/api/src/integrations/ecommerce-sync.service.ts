import { Injectable } from '@nestjs/common';
import {
  WooStockSyncService,
  type StockSyncEntry,
} from '../woocommerce/woo-stock-sync.service';
import { WooPriceSyncService } from '../woocommerce/woo-price-sync.service';
import { TnStockSyncService } from '../tiendanube/tn-stock-sync.service';

// Punto único desde el que el resto del sistema (ventas, ajustes de stock,
// compras, cambios de precio) avisa "esto cambió, propagalo a las tiendas
// online". Reparte a todas las integraciones configuradas.
//
// Existe para no tener que inyectar un servicio más en orders/stock/products/
// purchases cada vez que se suma un canal de venta. NO envuelve ni modifica
// la lógica de WooCommerce: solo la llama, igual que antes.
//
// Como los dos servicios que delega ya se tragan sus propios errores y nunca
// lanzan (un fallo de sincronización no puede tumbar una venta cobrada),
// alcanza con esperarlos en paralelo: ninguna promesa puede rechazar.
@Injectable()
export class EcommerceSyncService {
  constructor(
    private readonly wooStockSync: WooStockSyncService,
    private readonly wooPriceSync: WooPriceSyncService,
    private readonly tnStockSync: TnStockSyncService,
  ) {}

  async enqueueStockSync(
    tenantId: string,
    storeId: string,
    entries: StockSyncEntry[],
  ): Promise<void> {
    await Promise.all([
      this.wooStockSync.enqueueStockSync(tenantId, storeId, entries),
      this.tnStockSync.enqueueStockSync(tenantId, storeId, entries),
    ]);
  }

  async enqueuePriceSync(
    tenantId: string,
    productId: string,
    price: number,
  ): Promise<void> {
    await Promise.all([
      this.wooPriceSync.enqueuePriceSync(tenantId, productId, price),
      this.tnStockSync.enqueuePriceSync(tenantId, productId, price),
    ]);
  }
}
