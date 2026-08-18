import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Express } from 'express';
import { UserRole } from '@pos/database';
import { StoresService } from './stores.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import {
  storeLogoMulterOptions,
  STORE_LOGOS_DIR,
  STORE_LOGO_MAX_DIMENSION,
} from './store-logo.storage';
import { compressImage } from '../common/image-processing';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { requireTenant } from '../common/require-tenant';
import type { AuthUser } from '../common/types/auth-user';

@Controller('stores')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StoresController {
  constructor(private readonly storesService: StoresService) {}

  @Post()
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateStoreDto) {
    return this.storesService.create(requireTenant(user), dto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    return this.storesService.findAll(requireTenant(user));
  }

  @Patch(':id')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateStoreDto,
  ) {
    return this.storesService.update(requireTenant(user), id, dto);
  }

  @Post(':id/logo')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('file', storeLogoMulterOptions))
  async uploadLogo(
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
      maxWidth: STORE_LOGO_MAX_DIMENSION,
      maxHeight: STORE_LOGO_MAX_DIMENSION,
    });
    const filename = `${randomUUID()}.webp`;
    // Se valida (y persiste la URL) ANTES de tocar el disco: si el local no
    // existe/no es de este tenant, el update tira NotFoundException y nunca
    // se escribió nada — no hace falta limpiar ningún archivo huérfano.
    const updated = await this.storesService.updateLogo(
      requireTenant(user),
      id,
      `/uploads/stores/${filename}`,
    );
    await mkdir(STORE_LOGOS_DIR, { recursive: true });
    await writeFile(join(STORE_LOGOS_DIR, filename), compressed);
    return updated;
  }
}
