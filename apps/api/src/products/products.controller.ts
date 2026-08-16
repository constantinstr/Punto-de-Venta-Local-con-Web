import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@pos/database';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import { CreateBundleItemDto } from './dto/create-bundle-item.dto';
import { FindProductsQueryDto } from './dto/find-products-query.dto';
import { PosSearchQueryDto } from './dto/pos-search-query.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { requireTenant } from '../common/require-tenant';
import type { AuthUser } from '../common/types/auth-user';

const CATALOG_WRITE_ROLES = [
  UserRole.OWNER,
  UserRole.ADMIN,
  UserRole.MANAGER,
] as const;

@Controller('products')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query() query: FindProductsQueryDto) {
    return this.productsService.findAll(requireTenant(user), query);
  }

  // Declarado antes de ':id' — si no, Nest lo confunde con /products/:id.
  @Get('pos-search')
  posSearch(@CurrentUser() user: AuthUser, @Query() query: PosSearchQueryDto) {
    return this.productsService.posSearch(
      requireTenant(user),
      query.storeId,
      query.q,
    );
  }

  @Get('low-stock')
  lowStock(@CurrentUser() user: AuthUser, @Query('storeId') storeId: string) {
    return this.productsService.findLowStock(requireTenant(user), storeId);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.productsService.findOne(requireTenant(user), id);
  }

  @Post()
  @Roles(...CATALOG_WRITE_ROLES)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateProductDto) {
    return this.productsService.create(requireTenant(user), dto);
  }

  @Patch(':id')
  @Roles(...CATALOG_WRITE_ROLES)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.update(requireTenant(user), id, dto);
  }

  @Post(':id/variants')
  @Roles(...CATALOG_WRITE_ROLES)
  addVariant(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateVariantDto,
  ) {
    return this.productsService.addVariant(requireTenant(user), id, dto);
  }

  @Delete('variants/:variantId')
  @Roles(...CATALOG_WRITE_ROLES)
  removeVariant(
    @CurrentUser() user: AuthUser,
    @Param('variantId') variantId: string,
  ) {
    return this.productsService.removeVariant(requireTenant(user), variantId);
  }

  @Post(':id/bundle-items')
  @Roles(...CATALOG_WRITE_ROLES)
  addBundleItem(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateBundleItemDto,
  ) {
    return this.productsService.addBundleItem(requireTenant(user), id, dto);
  }

  @Delete('bundle-items/:bundleItemId')
  @Roles(...CATALOG_WRITE_ROLES)
  removeBundleItem(
    @CurrentUser() user: AuthUser,
    @Param('bundleItemId') bundleItemId: string,
  ) {
    return this.productsService.removeBundleItem(
      requireTenant(user),
      bundleItemId,
    );
  }
}
