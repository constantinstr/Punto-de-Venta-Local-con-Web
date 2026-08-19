import { Controller, HttpCode, Body, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { DemoService } from './demo.service';
import { RequestDemoCodeDto } from './dto/request-demo-code.dto';
import { VerifyDemoCodeDto } from './dto/verify-demo-code.dto';

// Sin @UseGuards a propósito: así es como un endpoint es anónimo en este
// repo (no hay guard global ni decorador @Public — ver auth.controller.ts,
// que hace lo mismo para /login y /register-tenant). No hace falta agregar
// '/demo' a ALWAYS_ALLOWED_PREFIXES en SubscriptionEnforcementInterceptor:
// sin JWT, req.user es undefined, y el interceptor ya deja pasar de largo
// cualquier request sin usuario/tenant.
@Controller('demo')
export class DemoController {
  constructor(private readonly demoService: DemoService) {}

  // Alta en DOS pasos: pedir el código exige un email real (frena el spam
  // de cuentas — decisión de producto) sin crear nada todavía en la base.
  // 3 por hora por IP: más estricto que register-tenant porque acá ni
  // siquiera hace falta un email que exista de verdad para gastar el envío
  // (rebota igual, pero cuesta el intento de mandar el mail).
  @Post('request-code')
  @HttpCode(200)
  @Throttle({ default: { limit: 3, ttl: 3_600_000 } })
  async requestCode(@Body() dto: RequestDemoCodeDto) {
    const { debugCode } = await this.demoService.requestCode(dto.email);
    return { ok: true, ...(debugCode ? { debugCode } : {}) };
  }

  // Más laxo que requestCode (10/min) porque acá el freno real es
  // server-side por código: MAX_CODE_ATTEMPTS en DemoService — este límite
  // solo evita que alguien scriptee miles de códigos al azar por minuto.
  @Post('verify-code')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  verifyCode(@Body() dto: VerifyDemoCodeDto) {
    return this.demoService.verifyCode(dto.email, dto.code);
  }
}
