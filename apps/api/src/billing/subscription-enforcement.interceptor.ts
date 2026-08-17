import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import type { Request } from 'express';
import { UserRole, withTenantContext } from '@pos/database';
import type { AuthUser } from '../common/types/auth-user';
import { SubscriptionService } from './subscription.service';

// Métodos que solo leen: nunca se bloquean bajo READ_ONLY, para que un
// comercio vencido siga pudiendo consultar y exportar SUS datos. No
// secuestrarle la información es lo correcto y además evita un reclamo.
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Rutas que esto NUNCA puede bloquear, sin importar la política:
//  - /auth y /health: si no, un vencido no podría ni loguearse para pagar.
//  - /webhooks: son públicos y de máquina; bloquearlos rompería el propio
//    cobro que dispara la reactivación.
//  - /billing: sería la trampa perfecta — vencido y sin forma de suscribirse.
const ALWAYS_ALLOWED_PREFIXES = ['/auth', '/health', '/webhooks', '/billing'];

// ES UN INTERCEPTOR Y NO UN GUARD A PROPÓSITO.
//
// En NestJS los guards corren en orden global → controller → ruta, así que un
// APP_GUARD se ejecutaría ANTES que el JwtAuthGuard que cada controller aplica
// a nivel de clase, y `req.user` todavía estaría vacío. Registrado así, el
// chequeo dejaría pasar todo siempre: hoy no se notaría (la política por
// defecto es WARN_ONLY y tampoco bloquea), pero el día que alguien pusiera un
// tenant en READ_ONLY fallaría en silencio y sin explicación.
//
// Los interceptores, en cambio, corren DESPUÉS de todos los guards, con
// req.user ya poblado. Puede lanzar la excepción antes de llamar a
// next.handle(), así que el efecto es idéntico al de un guard.
@Injectable()
export class SubscriptionEnforcementInterceptor implements NestInterceptor {
  private readonly logger = new Logger(SubscriptionEnforcementInterceptor.name);

  constructor(private readonly subscriptionService: SubscriptionService) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    if (context.getType() !== 'http') return next.handle();

    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>();

    const path = req.path ?? req.url ?? '';
    if (ALWAYS_ALLOWED_PREFIXES.some((p) => path.startsWith(p))) {
      return next.handle();
    }

    const user = req.user;
    const tenantId = user?.tenantId;
    // Sin usuario/tenant (endpoint público, o el JWT guard ya lo rechazó):
    // no es asunto de este interceptor.
    if (!user || !tenantId) return next.handle();
    // El staff del SaaS nunca queda afuera por la suscripción de un tenant.
    if (user.role === UserRole.SUPERADMIN) return next.handle();

    const tenant = await withTenantContext(tenantId, (tx) =>
      tx.tenant.findUnique({ where: { id: tenantId } }),
    );
    if (!tenant) return next.handle();

    const snapshot = this.subscriptionService.snapshotOf(tenant);

    // Con WARN_ONLY (el default y la política comercial elegida) ambos flags
    // son siempre false: acá no se bloquea nada y el aviso lo da el banner.
    if (snapshot.blocksAccess) {
      this.logger.warn(
        `Acceso bloqueado por suscripción vencida (tenant=${tenant.id}, estado=${snapshot.state})`,
      );
      throw new ForbiddenException(
        'La suscripción de este comercio está vencida. Regularizá el pago para volver a operar.',
      );
    }

    if (snapshot.blocksWrites && !READ_METHODS.has(req.method)) {
      throw new ForbiddenException(
        'La suscripción está vencida: el sistema quedó en modo solo lectura. Podés consultar y exportar tus datos, pero no registrar operaciones nuevas.',
      );
    }

    return next.handle();
  }
}
