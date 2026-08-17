import { BadRequestException } from '@nestjs/common';
import { BundlePricingService } from './bundle-pricing.service';
import type { TransactionClient } from '@pos/database';

// Doble mínimo de la transacción de Prisma: solo lo que toca este servicio.
// Los precios se devuelven como string, igual que Prisma con las columnas
// Decimal — si el servicio los sumara sin convertir, "3000" + "2500" daría
// "30002500" y el test lo cazaría.
function makeTx(overrides: {
  items?: {
    quantity: string;
    componentProduct: { price: string };
    componentVariant?: { price: string } | null;
  }[];
  bundle?: Record<string, unknown> | null;
}) {
  const updates: { where: { id: string }; data: Record<string, unknown> }[] =
    [];

  const tx = {
    bundleItem: {
      findMany: () => Promise.resolve(overrides.items ?? []),
      count: () => Promise.resolve((overrides.items ?? []).length),
    },
    product: {
      findFirst: () => Promise.resolve(overrides.bundle ?? null),
      update: (args: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        updates.push(args);
        return Promise.resolve({});
      },
    },
  } as unknown as TransactionClient;

  return { tx, updates };
}

describe('BundlePricingService', () => {
  const service = new BundlePricingService();

  describe('computeDerivedPrice', () => {
    it('suma precio × cantidad de cada componente', async () => {
      const { tx } = makeTx({
        items: [
          { quantity: '2', componentProduct: { price: '1500.00' } },
          { quantity: '1', componentProduct: { price: '2500.00' } },
        ],
      });
      expect(await service.computeDerivedPrice(tx, 'combo', null)).toBe(5500);
    });

    it('aplica el porcentaje de descuento del combo', async () => {
      const { tx } = makeTx({
        items: [
          { quantity: '2', componentProduct: { price: '1500.00' } },
          { quantity: '1', componentProduct: { price: '2500.00' } },
        ],
      });
      expect(await service.computeDerivedPrice(tx, 'combo', 10)).toBe(4950);
    });

    it('usa el precio de la variante cuando el componente apunta a una', async () => {
      const { tx } = makeTx({
        items: [
          {
            quantity: '1',
            componentProduct: { price: '1000.00' },
            componentVariant: { price: '1200.00' },
          },
        ],
      });
      expect(await service.computeDerivedPrice(tx, 'combo', null)).toBe(1200);
    });

    it('redondea a dos decimales', async () => {
      const { tx } = makeTx({
        items: [{ quantity: '3', componentProduct: { price: '333.33' } }],
      });
      // 999.99 - 15% = 849.9915
      expect(await service.computeDerivedPrice(tx, 'combo', 15)).toBe(849.99);
    });

    // Un combo vacío valdría $0. Devolver null deja que el caller decida, en
    // vez de publicar un producto gratis en la tienda online.
    it('devuelve null si el combo no tiene componentes', async () => {
      const { tx } = makeTx({ items: [] });
      expect(await service.computeDerivedPrice(tx, 'combo', 10)).toBeNull();
    });
  });

  describe('recalculateOne', () => {
    it('no toca un combo con precio manual', async () => {
      const { tx, updates } = makeTx({
        items: [{ quantity: '1', componentProduct: { price: '100.00' } }],
        bundle: {
          id: 'combo',
          price: '999.00',
          bundlePricingMode: 'MANUAL',
          bundleDiscountPercent: null,
        },
      });
      expect(await service.recalculateOne(tx, 'tenant', 'combo')).toBeNull();
      expect(updates).toHaveLength(0);
    });

    it('actualiza el precio de un combo derivado', async () => {
      const { tx, updates } = makeTx({
        items: [{ quantity: '2', componentProduct: { price: '1000.00' } }],
        bundle: {
          id: 'combo',
          price: '999.00',
          bundlePricingMode: 'DERIVED',
          bundleDiscountPercent: '10.00',
        },
      });
      expect(await service.recalculateOne(tx, 'tenant', 'combo')).toEqual({
        bundleProductId: 'combo',
        price: 1800,
      });
      expect(updates[0].data).toEqual({ price: 1800 });
    });

    // Sin esto, cada importación de Excel encolaría una sincronización por
    // combo aunque ningún precio se hubiera movido.
    it('no reporta cambio si el precio ya era el correcto', async () => {
      const { tx, updates } = makeTx({
        items: [{ quantity: '2', componentProduct: { price: '1000.00' } }],
        bundle: {
          id: 'combo',
          price: '1800.00',
          bundlePricingMode: 'DERIVED',
          bundleDiscountPercent: '10.00',
        },
      });
      expect(await service.recalculateOne(tx, 'tenant', 'combo')).toBeNull();
      expect(updates).toHaveLength(0);
    });

    it('vuelve a precio manual si se quedó sin componentes, conservando el precio', async () => {
      const { tx, updates } = makeTx({
        items: [],
        bundle: {
          id: 'combo',
          price: '1800.00',
          bundlePricingMode: 'DERIVED',
          bundleDiscountPercent: '10.00',
        },
      });
      expect(await service.recalculateOne(tx, 'tenant', 'combo')).toBeNull();
      expect(updates[0].data).toEqual({ bundlePricingMode: 'MANUAL' });
      // Lo importante: NO se escribió un precio de 0.
      expect(updates[0].data).not.toHaveProperty('price');
    });
  });

  describe('assertCanUseDerived', () => {
    it('rechaza pasar a derivado un combo sin componentes', async () => {
      const { tx } = makeTx({ items: [] });
      await expect(service.assertCanUseDerived(tx, 'combo')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('acepta si tiene al menos un componente', async () => {
      const { tx } = makeTx({
        items: [{ quantity: '1', componentProduct: { price: '100.00' } }],
      });
      await expect(
        service.assertCanUseDerived(tx, 'combo'),
      ).resolves.toBeUndefined();
    });
  });
});
