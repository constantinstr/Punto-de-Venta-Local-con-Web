import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { withTenantContext, type TransactionClient } from '@pos/database';
import type { CreateCategoryDto } from './dto/create-category.dto';
import type { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  findAll(tenantId: string) {
    return withTenantContext(tenantId, (tx) =>
      tx.category.findMany({ where: { tenantId }, orderBy: { name: 'asc' } }),
    );
  }

  async create(tenantId: string, dto: CreateCategoryDto) {
    return withTenantContext(tenantId, async (tx) => {
      if (dto.parentId) await this.assertExists(tx, tenantId, dto.parentId);
      return tx.category.create({
        data: { tenantId, name: dto.name, parentId: dto.parentId },
      });
    });
  }

  async update(tenantId: string, id: string, dto: UpdateCategoryDto) {
    return withTenantContext(tenantId, async (tx) => {
      await this.assertExists(tx, tenantId, id);
      if (dto.parentId) {
        if (dto.parentId === id) {
          throw new BadRequestException(
            'Una categoría no puede ser su propio padre',
          );
        }
        await this.assertExists(tx, tenantId, dto.parentId);
      }
      return tx.category.update({ where: { id }, data: dto });
    });
  }

  async remove(tenantId: string, id: string) {
    return withTenantContext(tenantId, async (tx) => {
      await this.assertExists(tx, tenantId, id);
      const childCount = await tx.category.count({ where: { parentId: id } });
      if (childCount > 0) {
        throw new BadRequestException(
          'No se puede borrar una categoría con subcategorías',
        );
      }
      await tx.category.delete({ where: { id } });
      return { deleted: true };
    });
  }

  private async assertExists(
    tx: TransactionClient,
    tenantId: string,
    id: string,
  ) {
    const category = await tx.category.findFirst({ where: { id, tenantId } });
    if (!category) throw new NotFoundException('Categoría no encontrada');
    return category;
  }
}
