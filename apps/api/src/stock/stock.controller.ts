import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@pos/database';
import { StockService } from './stock.service';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { requireTenant } from '../common/require-tenant';
import type { AuthUser } from '../common/types/auth-user';

@Controller('stock')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StockController {
  constructor(private readonly stockService: StockService) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query('storeId') storeId: string) {
    return this.stockService.findAllForStore(requireTenant(user), storeId);
  }

  @Post('adjust')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER)
  adjust(@CurrentUser() user: AuthUser, @Body() dto: AdjustStockDto) {
    return this.stockService.adjust(requireTenant(user), user, dto);
  }
}
