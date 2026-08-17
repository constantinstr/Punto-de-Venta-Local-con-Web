import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  BundlePricingMode,
  ProductType,
  type TransactionClient,
} from '@pos/database';

export interface RecalculatedBundle {
  bundleProductId: string;
  price: number;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Mantiene el precio de los combos DERIVED atado al de sus componentes.
//
// Todo lo que hace es trabajo de base, sin red: por eso los métodos reciben la
// transacción del caller y corren adentro de ella sin riesgo del timeout de
// 5s de Prisma. Lo que NO va adentro es el encolado del sync de precios hacia
// las tiendas online — por eso los métodos devuelven qué combos cambiaron, en
// vez de encolar ellos mismos.
@Injectable()
export class BundlePricingService {
  private readonly logger = new Logger(BundlePricingService.name);

  // Suma `precio × cantidad` de los componentes y aplica el descuento del
  // combo. Devuelve null si el combo no tiene componentes: un combo vacío
  // valdría $0, y poner un producto en $0 en silencio es peor que no tocarlo.
  async computeDerivedPrice(
    tx: TransactionClient,
    bundleProductId: string,
    discountPercent: number | null,
  ): Promise<number | null> {
    const items = await tx.bundleItem.findMany({
      where: { bundleProductId },
      include: {
        componentProduct: { select: { price: true } },
        componentVariant: { select: { price: true } },
      },
    });
    if (items.length === 0) return null;

    const sum = items.reduce((acc, item) => {
      // La variante manda si el componente apunta a una: es la que tiene el
      // precio real de ese SKU puntual.
      const unit = Number(
        item.componentVariant?.price ?? item.componentProduct.price,
      );
      return acc + unit * Number(item.quantity);
    }, 0);

    const percent = Math.min(Math.max(discountPercent ?? 0, 0), 100);
    return round2(sum * (1 - percent / 100));
  }

  // Recalcula UN combo. Se usa cuando cambió su composición o su modo de
  // precio. Devuelve null si no había nada que recalcular (combo MANUAL, o
  // sin componentes).
  async recalculateOne(
    tx: TransactionClient,
    tenantId: string,
    bundleProductId: string,
  ): Promise<RecalculatedBundle | null> {
    const bundle = await tx.product.findFirst({
      where: { id: bundleProductId, tenantId, type: ProductType.BUNDLE },
      select: {
        id: true,
        price: true,
        bundlePricingMode: true,
        bundleDiscountPercent: true,
      },
    });
    if (!bundle || bundle.bundlePricingMode !== BundlePricingMode.DERIVED) {
      return null;
    }

    const price = await this.computeDerivedPrice(
      tx,
      bundle.id,
      bundle.bundleDiscountPercent === null
        ? null
        : Number(bundle.bundleDiscountPercent),
    );

    // Se quedó sin componentes: vuelve a MANUAL conservando el último precio
    // conocido, en vez de quedar valiendo $0 hasta que alguien lo note.
    if (price === null) {
      await tx.product.update({
        where: { id: bundle.id },
        data: { bundlePricingMode: BundlePricingMode.MANUAL },
      });
      this.logger.warn(
        `El combo ${bundle.id} se quedó sin componentes: vuelve a precio manual conservando $${String(bundle.price)}`,
      );
      return null;
    }

    if (round2(Number(bundle.price)) === price) return null; // nada que hacer

    await tx.product.update({ where: { id: bundle.id }, data: { price } });
    return { bundleProductId: bundle.id, price };
  }

  // Recalcula todos los combos DERIVED que contengan alguno de estos
  // componentes. Es el punto que se llama desde cada camino que escribe un
  // precio (edición, actualización masiva, importación de Excel).
  //
  // Devuelve solo los que efectivamente cambiaron, para no encolar
  // sincronizaciones inútiles hacia WooCommerce y Tienda Nube.
  async recalculateForComponents(
    tx: TransactionClient,
    tenantId: string,
    componentProductIds: string[],
  ): Promise<RecalculatedBundle[]> {
    if (componentProductIds.length === 0) return [];

    const affected = await tx.bundleItem.findMany({
      where: {
        componentProductId: { in: componentProductIds },
        bundleProduct: {
          tenantId,
          bundlePricingMode: BundlePricingMode.DERIVED,
        },
      },
      select: { bundleProductId: true },
      distinct: ['bundleProductId'],
    });

    const results: RecalculatedBundle[] = [];
    for (const { bundleProductId } of affected) {
      const changed = await this.recalculateOne(tx, tenantId, bundleProductId);
      if (changed) results.push(changed);
    }
    return results;
  }

  // Valida el cambio de modo antes de guardarlo. Pasar a DERIVED sin
  // componentes dejaría el combo en $0 en cuanto se recalcule.
  async assertCanUseDerived(
    tx: TransactionClient,
    bundleProductId: string,
  ): Promise<void> {
    const count = await tx.bundleItem.count({ where: { bundleProductId } });
    if (count === 0) {
      throw new BadRequestException(
        'Para calcular el precio desde los componentes, el combo tiene que tener al menos uno',
      );
    }
  }
}
