import { Controller, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { DemoService } from './demo.service';

// Sin @UseGuards a propósito: así es como un endpoint es anónimo en este
// repo (no hay guard global ni decorador @Public — ver auth.controller.ts,
// que hace lo mismo para /login y /register-tenant). No hace falta agregar
// '/demo' a ALWAYS_ALLOWED_PREFIXES en SubscriptionEnforcementInterceptor:
// sin JWT, req.user es undefined, y el interceptor ya deja pasar de largo
// cualquier request sin usuario/tenant.
@Controller('demo')
export class DemoController {
  constructor(private readonly demoService: DemoService) {}

  // 2 por hora por IP — bastante más estricto que el 5/min de
  // register-tenant, porque acá no hace falta ni siquiera un email válido:
  // es el endpoint más barato de abusar de toda la API. Ver DEMO_MAX_LIVE en
  // DemoService para el tope global que cubre IPs distintas.
  @Post('start')
  @HttpCode(201)
  @Throttle({ default: { limit: 2, ttl: 3_600_000 } })
  start() {
    return this.demoService.provision();
  }
}
