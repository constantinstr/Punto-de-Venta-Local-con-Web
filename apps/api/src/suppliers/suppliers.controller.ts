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
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { FindSuppliersQueryDto } from './dto/find-suppliers-query.dto';
import { SuppliersService } from './suppliers.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { requireTenant } from '../common/require-tenant';
import type { AuthUser } from '../common/types/auth-user';

const WRITE_ROLES = [UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER] as const;

@Controller('suppliers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthUser,
    @Query() query: FindSuppliersQueryDto,
  ) {
    return this.suppliersService.findAll(requireTenant(user), query);
  }

  @Post()
  @Roles(...WRITE_ROLES)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSupplierDto) {
    return this.suppliersService.create(requireTenant(user), dto);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.suppliersService.findOne(requireTenant(user), id);
  }

  @Patch(':id')
  @Roles(...WRITE_ROLES)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateSupplierDto,
  ) {
    return this.suppliersService.update(requireTenant(user), id, dto);
  }
}
