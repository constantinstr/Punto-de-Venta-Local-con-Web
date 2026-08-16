import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { prisma, withTenantContext, Prisma } from '@pos/database';
import type { CreateWooConfigDto } from './dto/create-woo-config.dto';
import type { UpdateWooConfigDto } from './dto/update-woo-config.dto';

// Nunca se devuelven consumerKey/consumerSecret/webhookSecret por API una
// vez guardados — son credenciales de escritura sobre la tienda del
// cliente, no datos de lectura normal (mismo criterio que
// FiscalConfig.SAFE_SELECT en Sprint 6).
const SAFE_SELECT = {
  id: true,
  storeId: true,
  apiUrl: true,
  syncStockOutbound: true,
  syncStockInbound: true,
  isActive: true,
  lastSyncAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.WooCommerceConfigSelect;

@Injectable()
export class WooConfigService {
  constructor(private readonly config: ConfigService) {}

  private webhookUrl(id: string): string {
    const base = (
      this.config.get<string>('API_PUBLIC_URL') ?? 'http://localhost:3001'
    ).replace(/\/+$/, '');
    return `${base}/webhooks/woocommerce/orders?configId=${id}`;
  }

  async create(tenantId: string, dto: CreateWooConfigDto) {
    return withTenantContext(tenantId, async (tx) => {
      const store = await tx.store.findFirst({
        where: { id: dto.storeId, tenantId },
      });
      if (!store) throw new NotFoundException('Local no encontrado');

      try {
        const created = await tx.wooCommerceConfig.create({
          data: {
            tenantId,
            storeId: dto.storeId,
            apiUrl: dto.apiUrl,
            consumerKey: dto.consumerKey,
            consumerSecret: dto.consumerSecret,
            webhookSecret: dto.webhookSecret,
            syncStockOutbound: dto.syncStockOutbound ?? true,
            syncStockInbound: dto.syncStockInbound ?? true,
            isActive: dto.isActive ?? true,
          },
          select: SAFE_SELECT,
        });
        return { ...created, webhookUrl: this.webhookUrl(created.id) };
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          throw new ConflictException(
            'Ese local ya tiene una integración de WooCommerce configurada',
          );
        }
        throw err;
      }
    });
  }

  async update(tenantId: string, id: string, dto: UpdateWooConfigDto) {
    return withTenantContext(tenantId, async (tx) => {
      const existing = await tx.wooCommerceConfig.findFirst({
        where: { id, tenantId },
      });
      if (!existing)
        throw new NotFoundException('Integración de WooCommerce no encontrada');

      const updated = await tx.wooCommerceConfig.update({
        where: { id },
        data: dto,
        select: SAFE_SELECT,
      });
      return { ...updated, webhookUrl: this.webhookUrl(updated.id) };
    });
  }

  async findByStore(tenantId: string, storeId: string) {
    return withTenantContext(tenantId, async (tx) => {
      const config = await tx.wooCommerceConfig.findFirst({
        where: { storeId, tenantId },
        select: SAFE_SELECT,
      });
      if (!config)
        throw new NotFoundException(
          'El local no tiene integración de WooCommerce cargada',
        );
      return { ...config, webhookUrl: this.webhookUrl(config.id) };
    });
  }

  // Uso interno de WooStockSyncService / WooCatalogSyncService / el
  // endpoint de test-connection — sí incluye credenciales, nunca se expone
  // por un controller directamente.
  async getCredentialForStore(tenantId: string, storeId: string) {
    return withTenantContext(tenantId, async (tx) => {
      const config = await tx.wooCommerceConfig.findFirst({
        where: { storeId, tenantId },
      });
      if (!config)
        throw new NotFoundException(
          'El local no tiene integración de WooCommerce cargada',
        );
      return config;
    });
  }

  // Único punto del módulo que busca sin tenantId — el webhook público de
  // WooCommerce (ver woo-webhook.controller.ts) no trae un JWT, así que no
  // hay forma de conocer el tenant antes de resolver esta fila (el propio
  // configId en la URL del webhook ES el mecanismo de scoping). No usa
  // withTenantContext a propósito: WooCommerceConfig no tiene RLS forzada
  // (ver comentario en schema.prisma), así que una consulta directa alcanza.
  async findRawById(id: string) {
    return prisma.wooCommerceConfig.findUnique({ where: { id } });
  }

  async touchLastSync(tenantId: string, id: string) {
    return withTenantContext(tenantId, (tx) =>
      tx.wooCommerceConfig.update({
        where: { id },
        data: { lastSyncAt: new Date() },
      }),
    );
  }
}
