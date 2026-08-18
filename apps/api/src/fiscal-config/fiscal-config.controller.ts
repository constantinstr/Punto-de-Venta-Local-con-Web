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
import { FiscalConfigService } from './fiscal-config.service';
import { CreateFiscalConfigDto } from './dto/create-fiscal-config.dto';
import { UpdateFiscalConfigDto } from './dto/update-fiscal-config.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { requireTenant } from '../common/require-tenant';
import type { AuthUser } from '../common/types/auth-user';
import { Premium } from '../billing/premium.decorator';

@Controller('fiscal-config')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FiscalConfigController {
  constructor(private readonly fiscalConfigService: FiscalConfigService) {}

  // @Premium solo en los handlers de escritura: un tenant demo puede seguir
  // viendo si el local tiene configuración fiscal (GET), pero no cargar
  // certificados AFIP propios — eso es lo que compra el plan pago.
  @Post()
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @Premium('FISCAL_INVOICING')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateFiscalConfigDto) {
    return this.fiscalConfigService.create(requireTenant(user), dto);
  }

  @Get()
  findByStore(
    @CurrentUser() user: AuthUser,
    @Query('storeId') storeId: string,
  ) {
    return this.fiscalConfigService.findByStore(requireTenant(user), storeId);
  }

  @Patch(':id')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @Premium('FISCAL_INVOICING')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateFiscalConfigDto,
  ) {
    return this.fiscalConfigService.update(requireTenant(user), id, dto);
  }
}
