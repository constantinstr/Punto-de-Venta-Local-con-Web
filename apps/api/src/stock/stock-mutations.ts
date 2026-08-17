import { BadRequestException } from '@nestjs/common';
import type { TransactionClient } from '@pos/database';

export interface StockTarget {
  storeId: string;
  // Exactamente uno de los dos: productId cuando es un producto SIMPLE,
  // variantId cuando es una variante. Nunca ambos.
  productId: string | null;
  variantId: string | null;
}

// Prisma no permite pasar null en los campos de una clave única compuesta
// para findUnique/upsert (NULL nunca es "igual" a NULL en SQL, así que no
// es una forma confiable de direccionar una fila) — se resuelve a mano con
// findFirst en vez de upsert(). Único lugar del código que debe conocer
// este workaround; todo lo demás (orders.cancel, purchases.create,
// stock.adjust) pasa por acá.
export async function findStockLevel(
  tx: TransactionClient,
  target: Pick<StockTarget, 'storeId' | 'productId' | 'variantId'>,
) {
  return tx.stockLevel.findFirst({
    where: {
      storeId: target.storeId,
      productId: target.variantId ? null : target.productId,
      variantId: target.variantId,
    },
  });
}

// Suma siempre segura (nunca hay condición de carrera relevante al
// incrementar) — usada por el reingreso de stock al anular una venta y por
// la recepción de una compra.
export async function incrementStock(
  tx: TransactionClient,
  tenantId: string,
  target: StockTarget,
  quantity: number,
) {
  const existing = await findStockLevel(tx, target);
  if (existing) {
    return tx.stockLevel.update({
      where: { id: existing.id },
      data: { quantity: { increment: quantity } },
    });
  }
  return tx.stockLevel.create({
    data: {
      tenantId,
      storeId: target.storeId,
      productId: target.variantId ? null : target.productId,
      variantId: target.variantId,
      quantity,
    },
  });
}

// Decremento atómico con verificación de balance en la misma sentencia —
// mismo patrón documentado en docs/ARCHITECTURE.md §3: ninguna caja
// concurrente puede vender stock que no existe, sin locks pesimistas.
export async function decrementStockGuarded(
  tx: TransactionClient,
  target: StockTarget,
  quantity: number,
  label: string,
) {
  const affected = await tx.$executeRaw`
    UPDATE "StockLevel"
    SET quantity = quantity - ${quantity}, "updatedAt" = now()
    WHERE "storeId" = ${target.storeId}
      AND "productId" IS NOT DISTINCT FROM ${target.variantId ? null : target.productId}
      AND "variantId" IS NOT DISTINCT FROM ${target.variantId}
      AND quantity >= ${quantity}
  `;
  if (affected === 0) {
    throw new BadRequestException(`Stock insuficiente para "${label}"`);
  }
}
