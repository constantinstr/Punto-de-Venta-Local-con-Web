import { Injectable, NotFoundException } from '@nestjs/common';
import { withTenantContext } from '@pos/database';
import type { CreateStoreDto } from './dto/create-store.dto';
import type { UpdateStoreDto } from './dto/update-store.dto';
import { PlanService } from '../billing/plan.service';

@Injectable()
export class StoresService {
  constructor(private readonly planService: PlanService) {}

  create(tenantId: string, dto: CreateStoreDto) {
    return withTenantContext(tenantId, async (tx) => {
      // assertQuota cuenta DENTRO de esta misma transacción, antes del
      // insert — ver el comentario en PlanService.assertQuota.
      await this.planService.assertQuota(tx, tenantId, 'stores', 1);
      return tx.store.create({
        data: {
          tenantId,
          name: dto.name,
          address: dto.address,
          phone: dto.phone,
        },
      });
    });
  }

  findAll(tenantId: string) {
    return withTenantContext(tenantId, (tx) =>
      tx.store.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } }),
    );
  }

  // Solo nombre y dirección: un local no se puede "mover" de tenant ni
  // borrar, porque de él cuelgan ventas, stock y comprobantes fiscales ya
  // emitidos. Si un comercio cierra una sucursal, el dato histórico tiene
  // que seguir existiendo.
  async update(tenantId: string, id: string, dto: UpdateStoreDto) {
    return withTenantContext(tenantId, async (tx) => {
      const existing = await tx.store.findFirst({ where: { id, tenantId } });
      if (!existing) throw new NotFoundException('Local no encontrado');
      return tx.store.update({ where: { id }, data: dto });
    });
  }

  async updateLogo(tenantId: string, id: string, logoUrl: string) {
    return withTenantContext(tenantId, async (tx) => {
      const existing = await tx.store.findFirst({ where: { id, tenantId } });
      if (!existing) throw new NotFoundException('Local no encontrado');
      return tx.store.update({ where: { id }, data: { logoUrl } });
    });
  }
}
