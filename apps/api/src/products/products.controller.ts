import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Express, Response } from 'express';
import { UserRole } from '@pos/database';
import { ProductsService } from './products.service';
import { ProductsImportService } from './products-import.service';
import { ProductsBulkPriceService } from './products-bulk-price.service';
import {
  productImageMulterOptions,
  PRODUCT_IMAGES_DIR,
  PRODUCT_IMAGE_MAX_DIMENSION,
} from './product-image.storage';
import { compressImage } from '../common/image-processing';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import { CreateBundleItemDto } from './dto/create-bundle-item.dto';
import { FindProductsQueryDto } from './dto/find-products-query.dto';
import { PosSearchQueryDto } from './dto/pos-search-query.dto';
import { BulkPriceUpdateDto } from './dto/bulk-price-update.dto';
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

// Solo OWNER/ADMIN: importación y precios en lote pueden reescribir todo el
// catálogo de un golpe — más sensible que un alta manual de producto.
const BULK_WRITE_ROLES = [UserRole.OWNER, UserRole.ADMIN] as const;

const importFileMulterOptions = {
  storage: memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (
    _req: unknown,
    file: Express.Multer.File,
    cb: (error: Error | null, acceptFile: boolean) => void,
  ) => {
    const ok =
      file.mimetype ===
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.mimetype === 'text/csv' ||
      file.originalname.toLowerCase().endsWith('.xlsx') ||
      file.originalname.toLowerCase().endsWith('.csv');
    cb(null, ok);
  },
};

@Controller('products')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly productsImportService: ProductsImportService,
    private readonly productsBulkPriceService: ProductsBulkPriceService,
  ) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query() query: FindProductsQueryDto) {
    return this.productsService.findAll(requireTenant(user), query);
  }

  // Declaradas antes de ':id' — si no, Nest las confunde con /products/:id.
  @Get('import/template')
  @Roles(...BULK_WRITE_ROLES)
  async importTemplate(@Res() res: Response) {
    const buffer = await this.productsImportService.buildTemplate();
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="plantilla-productos.xlsx"',
    });
    res.send(buffer);
  }

  @Post('import/preview')
  @Roles(...BULK_WRITE_ROLES)
  @UseInterceptors(FileInterceptor('file', importFileMulterOptions))
  importPreview(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file)
      throw new BadRequestException('Archivo requerido (.xlsx o .csv)');
    return this.productsImportService.preview(requireTenant(user), file);
  }

  @Post('import/commit')
  @Roles(...BULK_WRITE_ROLES)
  @UseInterceptors(FileInterceptor('file', importFileMulterOptions))
  importCommit(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file)
      throw new BadRequestException('Archivo requerido (.xlsx o .csv)');
    return this.productsImportService.commit(requireTenant(user), user, file);
  }

  @Post('bulk-price/preview')
  @Roles(...BULK_WRITE_ROLES)
  bulkPricePreview(
    @CurrentUser() user: AuthUser,
    @Body() dto: BulkPriceUpdateDto,
  ) {
    return this.productsBulkPriceService.preview(requireTenant(user), dto);
  }

  @Post('bulk-price')
  @Roles(...BULK_WRITE_ROLES)
  bulkPriceApply(
    @CurrentUser() user: AuthUser,
    @Body() dto: BulkPriceUpdateDto,
  ) {
    return this.productsBulkPriceService.apply(requireTenant(user), user, dto);
  }

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

  @Post(':id/image')
  @Roles(...CATALOG_WRITE_ROLES)
  @UseInterceptors(FileInterceptor('file', productImageMulterOptions))
  async uploadImage(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException(
        'Archivo de imagen requerido (jpg/png/webp, máx 5MB)',
      );
    }
    const compressed = await compressImage(file.buffer, {
      maxWidth: PRODUCT_IMAGE_MAX_DIMENSION,
      maxHeight: PRODUCT_IMAGE_MAX_DIMENSION,
    });
    const filename = `${randomUUID()}.webp`;
    // Se valida (y persiste la URL) ANTES de tocar el disco: si el producto
    // no existe/no es de este tenant, el update tira NotFoundException y
    // nunca se escribió nada — no hace falta limpiar ningún archivo huérfano.
    const updated = await this.productsService.updateImage(
      requireTenant(user),
      id,
      `/uploads/products/${filename}`,
    );
    await mkdir(PRODUCT_IMAGES_DIR, { recursive: true });
    await writeFile(join(PRODUCT_IMAGES_DIR, filename), compressed);
    return updated;
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
