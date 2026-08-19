import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { UserRole, SupportMessageStatus } from '@pos/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/types/auth-user';
import { SubscriptionService } from './subscription.service';
import { UpdateTenantSubscriptionDto } from './dto/update-tenant-subscription.dto';
import { SupportService } from '../support/support.service';

// Panel del staff del SaaS. @Roles(SUPERADMIN) a nivel de clase: es el único
// lugar de la API que atraviesa el aislamiento entre tenants (vía
// withPlatformContext), así que la restricción va arriba de todo y no
// endpoint por endpoint, para que agregar uno nuevo no pueda olvidarla. Los
// endpoints de support-messages heredan esta protección gratis por eso mismo.
@Controller('platform')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPERADMIN)
export class PlatformController {
  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly supportService: SupportService,
  ) {}

  @Get('tenants')
  listTenants() {
    return this.subscriptionService.listAllTenants();
  }

  @Get('tenants/:id/events')
  listEvents(@Param('id') id: string) {
    return this.subscriptionService.listEventsForPlatform(id);
  }

  @Patch('tenants/:id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateTenantSubscriptionDto,
  ) {
    return this.subscriptionService.updateFromPlatform(id, user.email, {
      monthlyAmount: dto.monthlyAmount,
      enforcementPolicy: dto.enforcementPolicy,
      currentPeriodEnd: dto.currentPeriodEnd
        ? new Date(dto.currentPeriodEnd)
        : undefined,
      subscriptionStatus: dto.subscriptionStatus,
      notes: dto.notes,
    });
  }

  @Get('support-messages')
  listSupportMessages(@Query('status') status?: SupportMessageStatus) {
    return this.supportService.listForPlatform(status);
  }

  @Patch('support-messages/:id/resolve')
  resolveSupportMessage(@Param('id') id: string) {
    return this.supportService.resolve(id);
  }
}
