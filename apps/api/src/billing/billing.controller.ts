import {
  BadRequestException,
  Controller,
  Get,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole, withTenantContext } from '@pos/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { requireTenant } from '../common/require-tenant';
import type { AuthUser } from '../common/types/auth-user';
import { SubscriptionService } from './subscription.service';
import { MercadoPagoService } from './mercadopago.service';

@Controller('billing')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BillingController {
  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly mercadoPago: MercadoPagoService,
    private readonly config: ConfigService,
  ) {}

  // Sin restricción de rol: cualquier empleado logueado puede ver el estado,
  // porque es lo que alimenta el banner que se muestra en todo el sistema.
  @Get('me')
  getMine(@CurrentUser() user: AuthUser) {
    return this.subscriptionService.getOwnSubscription(requireTenant(user));
  }

  @Get('events')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  listEvents(@CurrentUser() user: AuthUser) {
    return this.subscriptionService.listOwnEvents(requireTenant(user));
  }

  // Devuelve el init_point de Mercado Pago: la URL donde el comercio adhiere
  // su tarjeta. Los datos de tarjeta nunca pasan por este servidor.
  @Post('subscribe')
  @Roles(UserRole.OWNER)
  async subscribe(@CurrentUser() user: AuthUser) {
    const tenantId = requireTenant(user);

    const tenant = await withTenantContext(tenantId, (tx) =>
      tx.tenant.findUnique({ where: { id: tenantId } }),
    );
    if (!tenant) throw new BadRequestException('Tenant no encontrado');

    const amount = tenant.monthlyAmount ? Number(tenant.monthlyAmount) : null;
    if (!amount || amount <= 0) {
      throw new BadRequestException(
        'Todavía no hay un precio mensual asignado a este comercio. Contactá al proveedor del sistema.',
      );
    }

    const webUrl =
      this.config.get<string>('APP_PUBLIC_URL') ?? 'http://localhost:3000';

    const preapproval = await this.mercadoPago.createPreapproval({
      tenantId,
      payerEmail: tenant.contactEmail ?? user.email,
      reason: `Suscripción mensual — ${tenant.name}`,
      amount,
      backUrl: `${webUrl}/settings/subscription`,
    });

    // Se guarda el vínculo ya, sin esperar al webhook: si el comercio
    // completa la adhesión y el webhook se pierde, igual sabemos a qué
    // suscripción de MP corresponde este tenant para poder reconciliar.
    await this.subscriptionService.linkPreapproval(tenantId, preapproval.id);

    return { initPoint: preapproval.init_point, preapprovalId: preapproval.id };
  }
}
