import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@pos/database';
import { CashRegistersService } from './cash-registers.service';
import { CreateCashRegisterDto } from './dto/create-cash-register.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { requireTenant } from '../common/require-tenant';
import type { AuthUser } from '../common/types/auth-user';

@Controller('cash-registers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CashRegistersController {
  constructor(private readonly cashRegistersService: CashRegistersService) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query('storeId') storeId?: string) {
    return this.cashRegistersService.findAll(requireTenant(user), storeId);
  }

  @Post()
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCashRegisterDto) {
    return this.cashRegistersService.create(requireTenant(user), dto);
  }
}
