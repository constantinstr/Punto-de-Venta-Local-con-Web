import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@pos/database';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { FindPurchasesQueryDto } from './dto/find-purchases-query.dto';
import { PurchasesService } from './purchases.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { requireTenant } from '../common/require-tenant';
import type { AuthUser } from '../common/types/auth-user';

const WRITE_ROLES = [UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER] as const;

@Controller('purchases')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  @Get()
  @Roles(...WRITE_ROLES)
  findAll(
    @CurrentUser() user: AuthUser,
    @Query() query: FindPurchasesQueryDto,
  ) {
    return this.purchasesService.findAll(requireTenant(user), query);
  }

  @Post()
  @Roles(...WRITE_ROLES)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePurchaseDto) {
    return this.purchasesService.create(requireTenant(user), user, dto);
  }

  @Get(':id')
  @Roles(...WRITE_ROLES)
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.purchasesService.findOne(requireTenant(user), id);
  }
}
