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
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { FindCustomersQueryDto } from './dto/find-customers-query.dto';
import { RegisterAccountPaymentDto } from './dto/register-account-payment.dto';
import { RegisterAccountAdjustmentDto } from './dto/register-account-adjustment.dto';
import { CustomersService } from './customers.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { requireTenant } from '../common/require-tenant';
import type { AuthUser } from '../common/types/auth-user';

@Controller('customers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  // GET/POST sin restricción de rol más allá de estar logueado: el
  // CustomerPicker del checkout (usado por cajeros) necesita buscar y dar de
  // alta clientes al vuelo. El resto del ABM (cuenta, ajustes) vive en
  // /customers, que el nav ya oculta a CASHIER.
  @Get()
  findAll(
    @CurrentUser() user: AuthUser,
    @Query() query: FindCustomersQueryDto,
  ) {
    return this.customersService.findAll(requireTenant(user), query);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCustomerDto) {
    return this.customersService.create(requireTenant(user), dto);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.customersService.findOne(requireTenant(user), id);
  }

  @Patch(':id')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.customersService.update(requireTenant(user), id, dto);
  }

  @Get(':id/account')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER)
  getAccount(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.customersService.getAccount(
      requireTenant(user),
      id,
      page ? Number(page) : undefined,
      limit ? Number(limit) : undefined,
    );
  }

  @Post(':id/account/payments')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER)
  registerPayment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RegisterAccountPaymentDto,
  ) {
    return this.customersService.registerPayment(
      requireTenant(user),
      user,
      id,
      dto,
    );
  }

  @Post(':id/account/adjustments')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  registerAdjustment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RegisterAccountAdjustmentDto,
  ) {
    return this.customersService.registerAdjustment(
      requireTenant(user),
      user,
      id,
      dto,
    );
  }
}
