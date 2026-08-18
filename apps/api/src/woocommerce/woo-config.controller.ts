import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@pos/database';
import { WooConfigService } from './woo-config.service';
import { CreateWooConfigDto } from './dto/create-woo-config.dto';
import { UpdateWooConfigDto } from './dto/update-woo-config.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { requireTenant } from '../common/require-tenant';
import type { AuthUser } from '../common/types/auth-user';
import { Premium } from '../billing/premium.decorator';

@Controller('woocommerce-config')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WooConfigController {
  constructor(private readonly wooConfigService: WooConfigService) {}

  // La creación del config es el gate real: sin config, WooStockSyncService/
  // WooPriceSyncService ya se auto-desactivan (ver ecommerce-sync.service.ts).
  @Post()
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @Premium('WOO_SYNC')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateWooConfigDto) {
    return this.wooConfigService.create(requireTenant(user), dto);
  }

  @Patch(':id')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @Premium('WOO_SYNC')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateWooConfigDto,
  ) {
    return this.wooConfigService.update(requireTenant(user), id, dto);
  }

  @Get()
  findByStore(
    @CurrentUser() user: AuthUser,
    @Query('storeId') storeId: string,
  ) {
    return this.wooConfigService.findByStore(requireTenant(user), storeId);
  }
}
