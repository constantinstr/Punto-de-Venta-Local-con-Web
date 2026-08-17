import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { withTenantContext, type TransactionClient } from '@pos/database';
import type { CreateCategoryDto } from './dto/create-category.dto';
import type { UpdateCategoryDto } from './dto/update-category.dto';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/types/auth-user';

@Injectable()
export class CategoriesService {
  constructor(private readonly auditService: AuditService) {}

  findAll(tenantId: string) {
    return withTenantContext(tenantId, (tx) =>
      tx.category.findMany({ where: { tenantId }, orderBy: { name: 'asc' } }),
    );
  }

  async create(tenantId: string, actor: AuthUser, dto: CreateCategoryDto) {
    return withTenantContext(tenantId, async (tx) => {
      if (dto.parentId) await this.assertExists(tx, tenantId, dto.parentId);
      const category = await tx.category.create({
        data: { tenantId, name: dto.name, parentId: dto.parentId },
      });
      await this.auditService.record(tx, tenantId, {
        userId: actor.userId,
        userEmail: actor.email,
        action: 'category.create',
        entityType: 'Category',
        entityId: category.id,
        metadata: { name: category.name },
      });
      return category;
    });
  }

  async update(
    tenantId: string,
    actor: AuthUser,
    id: string,
    dto: UpdateCategoryDto,
  ) {
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
      const category = await tx.category.update({ where: { id }, data: dto });
      await this.auditService.record(tx, tenantId, {
        userId: actor.userId,
        userEmail: actor.email,
        action: 'category.update',
        entityType: 'Category',
        entityId: category.id,
        metadata: { name: category.name },
      });
      return category;
    });
  }

  async remove(tenantId: string, actor: AuthUser, id: string) {
    return withTenantContext(tenantId, async (tx) => {
      const category = await this.assertExists(tx, tenantId, id);
      const childCount = await tx.category.count({ where: { parentId: id } });
      if (childCount > 0) {
        throw new BadRequestException(
          'No se puede borrar una categoría con subcategorías',
        );
      }
      // El FK es ON DELETE SET NULL — sin este chequeo, borrar acá
      // desasignaría en silencio la categoría de todos sus productos.
      const productCount = await tx.product.count({
        where: { categoryId: id },
      });
      if (productCount > 0) {
        throw new BadRequestException(
          'No se puede borrar una categoría con productos asignados',
        );
      }
      await tx.category.delete({ where: { id } });
      await this.auditService.record(tx, tenantId, {
        userId: actor.userId,
        userEmail: actor.email,
        action: 'category.delete',
        entityType: 'Category',
        entityId: id,
        metadata: { name: category.name },
      });
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
