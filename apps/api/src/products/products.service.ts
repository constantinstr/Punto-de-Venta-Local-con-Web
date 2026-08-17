import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  withTenantContext,
  ProductType,
  Prisma,
  type TransactionClient,
} from '@pos/database';
import { getAvailableStock } from '../stock/stock-calculation';
import { WooPriceSyncService } from '../woocommerce/woo-price-sync.service';
import type { CreateProductDto } from './dto/create-product.dto';
import type { UpdateProductDto } from './dto/update-product.dto';
import type { CreateVariantDto } from './dto/create-variant.dto';
import type { CreateBundleItemDto } from './dto/create-bundle-item.dto';
import type { FindProductsQueryDto } from './dto/find-products-query.dto';

const PRODUCT_INCLUDE = {
  category: true,
  variants: true,
  bundleComponents: {
    include: { componentProduct: true, componentVariant: true },
  },
} satisfies Prisma.ProductInclude;

@Injectable()
export class ProductsService {
  constructor(private readonly wooPriceSyncService: WooPriceSyncService) {}

  async create(tenantId: string, dto: CreateProductDto) {
    this.assertTypeShape(dto);

    return withTenantContext(tenantId, async (tx) => {
      if (dto.categoryId)
        await this.assertCategoryExists(tx, tenantId, dto.categoryId);

      const trackStock =
        dto.type === ProductType.BUNDLE ? false : (dto.trackStock ?? true);
      const barcode =
        dto.type === ProductType.VARIABLE ? null : (dto.barcode ?? null);

      const product = await this.runUnique(() =>
        tx.product.create({
          data: {
            tenantId,
            categoryId: dto.categoryId,
            sku: dto.sku,
            barcode,
            name: dto.name,
            description: dto.description,
            type: dto.type,
            costPrice: dto.costPrice,
            price: dto.price,
            vatCondition: dto.vatCondition,
            trackStock,
          },
        }),
      );

      if (dto.type === ProductType.VARIABLE) {
        for (const variantDto of dto.variants!) {
          await this.createVariantInTx(tx, tenantId, product.id, variantDto);
        }
      }

      if (dto.type === ProductType.BUNDLE) {
        for (const itemDto of dto.bundleItems!) {
          await this.createBundleItemInTx(tx, tenantId, product.id, itemDto);
        }
      }

      if (dto.type === ProductType.SIMPLE && dto.initialStock?.length) {
        for (const entry of dto.initialStock) {
          await this.assertStoreExists(tx, tenantId, entry.storeId);
          await tx.stockLevel.create({
            data: {
              tenantId,
              storeId: entry.storeId,
              productId: product.id,
              quantity: entry.quantity,
            },
          });
        }
      }

      return tx.product.findUniqueOrThrow({
        where: { id: product.id },
        include: PRODUCT_INCLUDE,
      });
    });
  }

  findAll(tenantId: string, query: FindProductsQueryDto) {
    return withTenantContext(tenantId, (tx) =>
      tx.product.findMany({
        where: {
          tenantId,
          categoryId: query.categoryId,
          type: query.type,
          ...(query.q
            ? {
                OR: [
                  { name: { contains: query.q, mode: 'insensitive' } },
                  { sku: { contains: query.q, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        include: { category: true, variants: true },
        orderBy: { name: 'asc' },
      }),
    );
  }

  async findLowStock(tenantId: string, storeId: string) {
    return withTenantContext(tenantId, async (tx) => {
      const levels = await tx.stockLevel.findMany({
        where: { tenantId, storeId, minAlertStock: { not: null } },
        include: { product: true, variant: { include: { product: true } } },
      });

      return levels
        .filter((l) => Number(l.quantity) <= Number(l.minAlertStock))
        .map((l) => ({
          productId: l.productId ?? l.variant?.productId ?? null,
          variantId: l.variantId,
          name: l.variant ? l.variant.product.name : (l.product?.name ?? ''),
          attributes: l.variant?.attributes ?? null,
          sku: l.variant?.sku ?? l.product?.sku ?? '',
          quantity: Number(l.quantity),
          minAlertStock: Number(l.minAlertStock),
        }));
    });
  }

  async findOne(tenantId: string, id: string) {
    return withTenantContext(tenantId, async (tx) => {
      const product = await tx.product.findFirst({
        where: { id, tenantId },
        include: PRODUCT_INCLUDE,
      });
      if (!product) throw new NotFoundException('Producto no encontrado');
      return product;
    });
  }

  async update(tenantId: string, id: string, dto: UpdateProductDto) {
    const product = await withTenantContext(tenantId, async (tx) => {
      await this.assertProductExists(tx, tenantId, id);
      if (dto.categoryId)
        await this.assertCategoryExists(tx, tenantId, dto.categoryId);
      return this.runUnique(() =>
        tx.product.update({
          where: { id },
          data: dto,
          include: PRODUCT_INCLUDE,
        }),
      );
    });

    // Fuera de la transacción a propósito, mismo criterio que
    // WooStockSyncService: encolar sync de WooCommerce nunca debe poder
    // hacer fallar (ni demorar) una edición de catálogo ya guardada.
    if (dto.price !== undefined) {
      await this.wooPriceSyncService.enqueuePriceSync(
        tenantId,
        id,
        Number(product.price),
      );
    }

    return product;
  }

  async updateImage(tenantId: string, id: string, imageUrl: string) {
    return withTenantContext(tenantId, async (tx) => {
      await this.assertProductExists(tx, tenantId, id);
      return tx.product.update({
        where: { id },
        data: { imageUrl },
        include: PRODUCT_INCLUDE,
      });
    });
  }

  async addVariant(tenantId: string, productId: string, dto: CreateVariantDto) {
    return withTenantContext(tenantId, async (tx) => {
      const product = await this.assertProductExists(tx, tenantId, productId);
      if (product.type !== ProductType.VARIABLE) {
        throw new BadRequestException(
          'Solo los productos de tipo VARIABLE aceptan variantes',
        );
      }
      const variant = await this.createVariantInTx(
        tx,
        tenantId,
        productId,
        dto,
      );
      return tx.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    });
  }

  async removeVariant(tenantId: string, variantId: string) {
    return withTenantContext(tenantId, async (tx) => {
      const variant = await tx.productVariant.findFirst({
        where: { id: variantId, tenantId },
      });
      if (!variant) throw new NotFoundException('Variante no encontrada');
      await tx.productVariant.delete({ where: { id: variantId } });
      return { deleted: true };
    });
  }

  async addBundleItem(
    tenantId: string,
    bundleProductId: string,
    dto: CreateBundleItemDto,
  ) {
    return withTenantContext(tenantId, async (tx) => {
      const product = await this.assertProductExists(
        tx,
        tenantId,
        bundleProductId,
      );
      if (product.type !== ProductType.BUNDLE) {
        throw new BadRequestException(
          'Solo los productos de tipo BUNDLE aceptan componentes',
        );
      }
      const item = await this.createBundleItemInTx(
        tx,
        tenantId,
        bundleProductId,
        dto,
      );
      return tx.bundleItem.findUniqueOrThrow({
        where: { id: item.id },
        include: { componentProduct: true, componentVariant: true },
      });
    });
  }

  async removeBundleItem(tenantId: string, bundleItemId: string) {
    return withTenantContext(tenantId, async (tx) => {
      const item = await tx.bundleItem.findFirst({
        where: { id: bundleItemId, bundleProduct: { tenantId } },
      });
      if (!item)
        throw new NotFoundException('Componente de combo no encontrado');
      await tx.bundleItem.delete({ where: { id: bundleItemId } });
      return { deleted: true };
    });
  }

  // Buscador de mostrador: prioridad 1 = coincidencia exacta de código de
  // barras (producto simple o variante); si no hay match exacto, cae a
  // coincidencia parcial de SKU/nombre. Devuelve el stock disponible en
  // storeId para cada resultado (incluye combos con stock virtual).
  async posSearch(tenantId: string, storeId: string, q: string) {
    return withTenantContext(tenantId, async (tx) => {
      const exactProduct = await tx.product.findFirst({
        where: { tenantId, barcode: q, isActive: true },
      });
      if (exactProduct) {
        return [await this.toSearchResult(tx, storeId, exactProduct, null)];
      }

      const exactVariant = await tx.productVariant.findFirst({
        where: { tenantId, barcode: q, product: { isActive: true } },
        include: { product: true },
      });
      if (exactVariant) {
        return [
          await this.toSearchResult(
            tx,
            storeId,
            exactVariant.product,
            exactVariant,
          ),
        ];
      }

      const matches = await tx.product.findMany({
        where: {
          tenantId,
          isActive: true,
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { sku: { contains: q, mode: 'insensitive' } },
          ],
        },
        include: { variants: true },
        take: 20,
      });

      const results: Awaited<ReturnType<typeof this.toSearchResult>>[] = [];
      for (const product of matches) {
        if (product.variants.length > 0) {
          for (const variant of product.variants) {
            results.push(
              await this.toSearchResult(tx, storeId, product, variant),
            );
          }
        } else {
          results.push(await this.toSearchResult(tx, storeId, product, null));
        }
      }
      return results;
    });
  }

  private async toSearchResult(
    tx: TransactionClient,
    storeId: string,
    product: {
      id: string;
      type: string;
      trackStock: boolean;
      name: string;
      sku: string;
      barcode: string | null;
      price: Prisma.Decimal;
      vatCondition: string;
    },
    variant: {
      id: string;
      sku: string;
      barcode: string | null;
      attributes: unknown;
      price: Prisma.Decimal | null;
    } | null,
  ) {
    const stock = await getAvailableStock(
      tx,
      storeId,
      product,
      variant?.id ?? null,
    );
    return {
      productId: product.id,
      variantId: variant?.id ?? null,
      name: product.name,
      sku: variant?.sku ?? product.sku,
      barcode: variant?.barcode ?? product.barcode,
      attributes: variant?.attributes ?? null,
      price: Number(variant?.price ?? product.price),
      vatCondition: product.vatCondition,
      productType: product.type,
      availableStock: stock.quantity,
      isUnlimitedStock: stock.isUnlimited,
    };
  }

  private async createVariantInTx(
    tx: TransactionClient,
    tenantId: string,
    productId: string,
    dto: CreateVariantDto,
  ) {
    const variant = await this.runUnique(() =>
      tx.productVariant.create({
        data: {
          tenantId,
          productId,
          sku: dto.sku,
          barcode: dto.barcode,
          attributes: dto.attributes,
          price: dto.price,
          costPrice: dto.costPrice,
        },
      }),
    );

    if (dto.initialStock?.length) {
      for (const entry of dto.initialStock) {
        await this.assertStoreExists(tx, tenantId, entry.storeId);
        await tx.stockLevel.create({
          data: {
            tenantId,
            storeId: entry.storeId,
            variantId: variant.id,
            quantity: entry.quantity,
          },
        });
      }
    }

    return variant;
  }

  private async createBundleItemInTx(
    tx: TransactionClient,
    tenantId: string,
    bundleProductId: string,
    dto: CreateBundleItemDto,
  ) {
    if (dto.componentProductId === bundleProductId) {
      throw new BadRequestException(
        'Un combo no puede tenerse a sí mismo como componente',
      );
    }

    const component = await tx.product.findFirst({
      where: { id: dto.componentProductId, tenantId },
    });
    if (!component)
      throw new NotFoundException('Producto componente no encontrado');
    if (component.type === ProductType.BUNDLE) {
      throw new BadRequestException(
        'Un combo no puede tener otro combo como componente',
      );
    }

    if (dto.componentVariantId) {
      const variant = await tx.productVariant.findFirst({
        where: {
          id: dto.componentVariantId,
          tenantId,
          productId: dto.componentProductId,
        },
      });
      if (!variant)
        throw new NotFoundException(
          'Variante componente no encontrada para ese producto',
        );
    }

    return this.runUnique(() =>
      tx.bundleItem.create({
        data: {
          bundleProductId,
          componentProductId: dto.componentProductId,
          componentVariantId: dto.componentVariantId,
          quantity: dto.quantity,
        },
      }),
    );
  }

  private assertTypeShape(dto: CreateProductDto) {
    if (dto.type === ProductType.SIMPLE) {
      if (dto.variants?.length)
        throw new BadRequestException('Un producto SIMPLE no lleva variantes');
      if (dto.bundleItems?.length)
        throw new BadRequestException(
          'Un producto SIMPLE no lleva componentes de combo',
        );
    }

    if (dto.type === ProductType.VARIABLE) {
      if (!dto.variants?.length) {
        throw new BadRequestException(
          'Un producto VARIABLE necesita al menos una variante',
        );
      }
      if (dto.barcode) {
        throw new BadRequestException(
          'Los productos VARIABLE no llevan código de barras propio: cada variante tiene el suyo',
        );
      }
      if (dto.bundleItems?.length)
        throw new BadRequestException(
          'Un producto VARIABLE no lleva componentes de combo',
        );
    }

    if (dto.type === ProductType.BUNDLE) {
      if (!dto.bundleItems?.length) {
        throw new BadRequestException(
          'Un combo necesita al menos un componente',
        );
      }
      if (dto.variants?.length)
        throw new BadRequestException('Un producto BUNDLE no lleva variantes');
      if (dto.initialStock?.length) {
        throw new BadRequestException(
          'Un combo no tiene stock propio: se calcula a partir de sus componentes',
        );
      }
    }
  }

  private async assertProductExists(
    tx: TransactionClient,
    tenantId: string,
    id: string,
  ) {
    const product = await tx.product.findFirst({ where: { id, tenantId } });
    if (!product) throw new NotFoundException('Producto no encontrado');
    return product;
  }

  private async assertCategoryExists(
    tx: TransactionClient,
    tenantId: string,
    categoryId: string,
  ) {
    const category = await tx.category.findFirst({
      where: { id: categoryId, tenantId },
    });
    if (!category) throw new NotFoundException('Categoría no encontrada');
  }

  private async assertStoreExists(
    tx: TransactionClient,
    tenantId: string,
    storeId: string,
  ) {
    const store = await tx.store.findFirst({
      where: { id: storeId, tenantId },
    });
    if (!store) throw new NotFoundException('Local no encontrado');
  }

  private async runUnique<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          'Ya existe un producto/variante con ese SKU o código de barras',
        );
      }
      throw err;
    }
  }
}
