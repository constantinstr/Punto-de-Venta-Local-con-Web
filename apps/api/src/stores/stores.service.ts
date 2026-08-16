import { Injectable } from '@nestjs/common';
import { withTenantContext } from '@pos/database';
import type { CreateStoreDto } from './dto/create-store.dto';

@Injectable()
export class StoresService {
  create(tenantId: string, dto: CreateStoreDto) {
    return withTenantContext(tenantId, (tx) =>
      tx.store.create({
        data: { tenantId, name: dto.name, address: dto.address },
      }),
    );
  }

  findAll(tenantId: string) {
    return withTenantContext(tenantId, (tx) =>
      tx.store.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } }),
    );
  }
}
