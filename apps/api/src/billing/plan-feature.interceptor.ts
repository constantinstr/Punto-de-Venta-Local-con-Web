import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Observable } from 'rxjs';
import type { Request } from 'express';
import { UserRole } from '@pos/database';
import type { AuthUser } from '../common/types/auth-user';
import { PlanService } from './plan.service';
import { PREMIUM_FEATURE_KEY } from './premium.decorator';

// Segundo APP_INTERCEPTOR global, HERMANO de SubscriptionEnforcementInterceptor
// y no una extensión suya, a propósito:
//
// SubscriptionEnforcementInterceptor responde "¿este comercio está al día con
// el pago?" — su bloqueo depende del tiempo (venció, no venció) y de una
// política por tenant (WARN_ONLY/READ_ONLY/BLOCK).
//
// Este responde una pregunta distinta: "¿qué PLAN tiene, más allá de si está
// al día?". Un tenant demo nunca "vence" en el sentido de suscripción — el
// cartel Premium no es una mora, es un límite de producto. Meter las dos
// políticas en una sola clase la deja respondiendo dos preguntas con un
// nombre que solo describe una, y cada límite nuevo agrandaría un if-chain
// en un archivo que no es sobre eso.
//
// Por qué interceptor y no guard: mismo motivo que el otro — los guards
// globales corren antes que el JwtAuthGuard de cada controller y req.user
// todavía estaría vacío.
//
// Por qué decorador y no prefijo de ruta (como ALWAYS_ALLOWED_PREFIXES): un
// prefijo bloquearía TODOS los métodos bajo /woocommerce, incluidos los GET
// de solo lectura. @Premium se pone por controller o por handler, así que
// un tenant demo puede seguir viendo que existe la integración sin poder
// activarla.
@Injectable()
export class PlanFeatureInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly planService: PlanService,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    if (context.getType() !== 'http') return next.handle();

    const feature = this.reflector.getAllAndOverride<string | undefined>(
      PREMIUM_FEATURE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!feature) return next.handle();

    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const user = req.user;
    // Sin usuario/tenant: no es asunto de este interceptor (endpoint público,
    // o el JwtAuthGuard ya lo rechazó). Esto es lo que deja pasar sin cambios
    // a POST /demo/request-code y /demo/verify-code, anónimos — no hace falta agregarlos a ninguna
    // lista de rutas permitidas.
    if (!user || !user.tenantId) return next.handle();
    // El staff del SaaS nunca queda afuera de una función por el plan de un tenant.
    if (user.role === UserRole.SUPERADMIN) return next.handle();

    await this.planService.assertFeature(
      user.tenantId,
      feature as Parameters<PlanService['assertFeature']>[1],
    );

    return next.handle();
  }
}
