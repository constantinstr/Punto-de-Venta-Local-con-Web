import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { withTenantContext, Prisma } from '@pos/database';
import type { CreateFiscalConfigDto } from './dto/create-fiscal-config.dto';

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
            crtCertificate: dto.crtCertificate,
            keyCertificate: dto.keyCertificate,
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
