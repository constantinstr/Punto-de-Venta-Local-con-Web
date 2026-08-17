import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { withTenantContext, Prisma } from '@pos/database';
import { EncryptionService } from '../common/crypto/encryption.service';
import type { CreateFiscalConfigDto } from './dto/create-fiscal-config.dto';
import type { UpdateFiscalConfigDto } from './dto/update-fiscal-config.dto';

// Nunca se devuelven crtCertificate/keyCertificate por API una vez
// guardados — son secretos de firma, no datos de lectura normal.
const SAFE_SELECT = {
  id: true,
  storeId: true,
  cuit: true,
  taxCondition: true,
  grossIncomeNumber: true,
  activityStartDate: true,
  ptoVta: true,
  isProduction: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.FiscalConfigSelect;

@Injectable()
export class FiscalConfigService {
  constructor(private readonly encryption: EncryptionService) {}

  async create(tenantId: string, dto: CreateFiscalConfigDto) {
    return withTenantContext(tenantId, async (tx) => {
      const store = await tx.store.findFirst({
        where: { id: dto.storeId, tenantId },
      });
      if (!store) throw new NotFoundException('Local no encontrado');

      try {
        return await tx.fiscalConfig.create({
          data: {
            tenantId,
            storeId: dto.storeId,
            cuit: dto.cuit,
            taxCondition: dto.taxCondition,
            grossIncomeNumber: dto.grossIncomeNumber,
            activityStartDate: dto.activityStartDate
              ? new Date(dto.activityStartDate)
              : undefined,
            ptoVta: dto.ptoVta,
            // Ambos se guardan cifrados con AES-256-GCM. El certificado es
            // público y no necesitaría cifrarse, pero se cifra igual para que
            // no queden dos formatos conviviendo en la misma tabla y para que
            // un dump de la base no revele ni siquiera a nombre de quién está
            // emitido cada punto de venta.
            crtCertificate: this.encryption.encrypt(dto.crtCertificate),
            keyCertificate: this.encryption.encrypt(dto.keyCertificate),
            isProduction: dto.isProduction ?? false,
          },
          select: SAFE_SELECT,
        });
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          throw new ConflictException(
            'Ese local ya tiene una configuración fiscal, o el punto de venta ya está en uso',
          );
        }
        throw err;
      }
    });
  }

  // Rotar el certificado tiene que poder hacerse desde la app: los de AFIP
  // vencen cada 2 años, y hasta ahora la única forma era entrar a la base.
  async update(tenantId: string, id: string, dto: UpdateFiscalConfigDto) {
    // Un certificado nuevo con la clave anterior no firma nada: WSAA
    // rechazaría el CMS y el comercio se quedaría sin poder facturar sin
    // entender por qué. Se exige el par completo.
    const crt = dto.crtCertificate;
    const key = dto.keyCertificate;
    if (Boolean(crt) !== Boolean(key)) {
      throw new BadRequestException(
        'El certificado y la clave privada se actualizan juntos: uno sin el otro no sirve para firmar',
      );
    }

    return withTenantContext(tenantId, async (tx) => {
      const existing = await tx.fiscalConfig.findFirst({
        where: { id, tenantId },
      });
      if (!existing) {
        throw new NotFoundException('Configuración fiscal no encontrada');
      }

      return tx.fiscalConfig.update({
        where: { id },
        data: {
          cuit: dto.cuit,
          taxCondition: dto.taxCondition,
          grossIncomeNumber: dto.grossIncomeNumber,
          activityStartDate: dto.activityStartDate
            ? new Date(dto.activityStartDate)
            : undefined,
          ptoVta: dto.ptoVta,
          isProduction: dto.isProduction,
          ...(crt && key
            ? {
                crtCertificate: this.encryption.encrypt(crt),
                keyCertificate: this.encryption.encrypt(key),
              }
            : {}),
        },
        select: SAFE_SELECT,
      });
    });
  }

  async findByStore(tenantId: string, storeId: string) {
    return withTenantContext(tenantId, async (tx) => {
      const config = await tx.fiscalConfig.findFirst({
        where: { storeId, tenantId },
        select: SAFE_SELECT,
      });
      if (!config)
        throw new NotFoundException(
          'El local no tiene configuración fiscal cargada',
        );
      return config;
    });
  }

  // Uso interno de InvoicesService — acá sí incluye los certificados,
  // nunca se expone por un controller.
  async getCredentialForStore(tenantId: string, storeId: string) {
    return withTenantContext(tenantId, async (tx) => {
      const config = await tx.fiscalConfig.findFirst({
        where: { storeId, tenantId },
      });
      if (!config)
        throw new NotFoundException(
          'El local no tiene configuración fiscal cargada',
        );
      return config;
    });
  }
}
