import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  withTenantContext,
  Prisma,
  type TiendanubeConfig,
} from '@pos/database';
import { EncryptionService } from '../common/crypto/encryption.service';
import {
  TIENDANUBE_GATEWAY,
  type TiendanubeGateway,
  type TnCredentialInput,
} from './tiendanube-gateway.interface';
import type { UpdateTnConfigDto } from './dto/update-tn-config.dto';

// Nunca se devuelve accessToken por la API: es la credencial que permite
// operar la tienda del cliente. La pantalla muestra solo metadatos.
const SAFE_SELECT = {
  id: true,
  storeId: true,
  tnStoreId: true,
  scopes: true,
  syncStockOutbound: true,
  syncStockInbound: true,
  syncPriceOutbound: true,
  isActive: true,
  lastSyncAt: true,
  createdAt: true,
} satisfies Prisma.TiendanubeConfigSelect;

@Injectable()
export class TnConfigService {
  private readonly logger = new Logger(TnConfigService.name);

  constructor(
    @Inject(TIENDANUBE_GATEWAY) private readonly gateway: TiendanubeGateway,
    private readonly encryption: EncryptionService,
  ) {}

  // Se llama desde el callback de OAuth. Es un upsert porque reinstalar la
  // app es un caso normal: el comercio la desinstala, la vuelve a instalar, y
  // llega un token nuevo para el mismo local — no debería fallar por
  // duplicado ni crear una segunda configuración huérfana.
  async saveFromOAuth(params: {
    tenantId: string;
    storeId: string;
    tnStoreId: string;
    accessToken: string;
    scopes: string;
  }): Promise<TiendanubeConfig> {
    const encrypted = this.encryption.encrypt(params.accessToken);

    return withTenantContext(params.tenantId, async (tx) => {
      const existing = await tx.tiendanubeConfig.findFirst({
        where: { storeId: params.storeId, tenantId: params.tenantId },
      });

      if (existing) {
        return tx.tiendanubeConfig.update({
          where: { id: existing.id },
          data: {
            tnStoreId: params.tnStoreId,
            accessToken: encrypted,
            scopes: params.scopes,
            isActive: true,
          },
        });
      }

      return tx.tiendanubeConfig.create({
        data: {
          tenantId: params.tenantId,
          storeId: params.storeId,
          tnStoreId: params.tnStoreId,
          accessToken: encrypted,
          scopes: params.scopes,
        },
      });
    });
  }

  async findByStore(tenantId: string, storeId: string) {
    return withTenantContext(tenantId, (tx) =>
      tx.tiendanubeConfig.findFirst({
        where: { storeId, tenantId },
        select: SAFE_SELECT,
      }),
    );
  }

  async update(tenantId: string, id: string, dto: UpdateTnConfigDto) {
    return withTenantContext(tenantId, async (tx) => {
      const existing = await tx.tiendanubeConfig.findFirst({
        where: { id, tenantId },
      });
      if (!existing) {
        throw new NotFoundException('Integración de Tienda Nube no encontrada');
      }
      return tx.tiendanubeConfig.update({
        where: { id },
        data: dto,
        select: SAFE_SELECT,
      });
    });
  }

  // Uso interno de los servicios de sincronización: acá sí se descifra el
  // token, y solo para armar la credencial que va al gateway. Nunca se
  // expone por un controller.
  async getCredential(
    tenantId: string,
    storeId: string,
  ): Promise<{
    config: TiendanubeConfig;
    credential: TnCredentialInput;
  } | null> {
    const config = await withTenantContext(tenantId, (tx) =>
      tx.tiendanubeConfig.findFirst({ where: { storeId, tenantId } }),
    );
    if (!config) return null;

    return {
      config,
      credential: {
        tnStoreId: config.tnStoreId,
        accessToken: this.encryption.decryptIfLegacyPlaintext(
          config.accessToken,
          `tiendanube store=${storeId}`,
        ),
      },
    };
  }

  async testConnection(tenantId: string, storeId: string) {
    const resolved = await this.getCredential(tenantId, storeId);
    if (!resolved) {
      throw new NotFoundException('Este local no tiene Tienda Nube conectada');
    }
    return this.gateway.testConnection(resolved.credential);
  }

  async touchLastSync(tenantId: string, configId: string): Promise<void> {
    await withTenantContext(tenantId, (tx) =>
      tx.tiendanubeConfig.update({
        where: { id: configId },
        data: { lastSyncAt: new Date() },
      }),
    );
  }
}
