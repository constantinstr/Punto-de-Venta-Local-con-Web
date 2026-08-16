import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@pos/database';
import { FiscalConfigService } from './fiscal-config.service';
import { CreateFiscalConfigDto } from './dto/create-fiscal-config.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { requireTenant } from '../common/require-tenant';
import type { AuthUser } from '../common/types/auth-user';

@Controller('fiscal-config')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FiscalConfigController {
  constructor(private readonly fiscalConfigService: FiscalConfigService) {}

  @Post()
  @Roles(UserRole.OWNER, UserRole.ADMIN)
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
}
