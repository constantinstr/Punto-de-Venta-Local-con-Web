import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { UserRole } from '@pos/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { requireTenant } from '../common/require-tenant';
import type { AuthUser } from '../common/types/auth-user';
import { DiscountPolicyService } from './discount-policy.service';
import { SetDiscountPolicyDto } from './dto/set-discount-policy.dto';

@Controller('discount-policies')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DiscountPolicyController {
  constructor(private readonly service: DiscountPolicyService) {}

  // Lo puede leer cualquiera que venda: el POS necesita el tope propio para
  // no dejar cargar un descuento que el backend va a rechazar después.
  // Devolver el tope no es filtrar nada — el cajero lo descubriría igual al
  // primer intento rechazado.
  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    return this.service.findAll(requireTenant(user));
  }

  // PUT y no POST: es idempotente por rol (upsert), no crea una fila nueva
  // cada vez que se guarda la pantalla.
  @Put()
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  set(@CurrentUser() user: AuthUser, @Body() dto: SetDiscountPolicyDto) {
    return this.service.set(requireTenant(user), dto);
  }
}
