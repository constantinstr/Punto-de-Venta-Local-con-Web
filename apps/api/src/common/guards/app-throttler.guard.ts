import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

// Los e2e-spec.ts de este proyecto crean tenants/usuarios a un ritmo que
// rompería el límite de auth (5/min) sin ser abuso real — es la propia
// naturaleza de una suite de tests. THROTTLE_DISABLE_FOR_TESTS=true (fijado
// por defecto en test/jest-e2e.setup.ts) apaga el throttling para toda la
// suite; auth-security.e2e-spec.ts, que sí necesita probar el 429 real, lo
// reactiva en su propio archivo. Se chequea acá (en tiempo de request, no
// de import) para no depender de en qué orden Jest cargue los módulos.
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected shouldSkip(): Promise<boolean> {
    return Promise.resolve(process.env.THROTTLE_DISABLE_FOR_TESTS === 'true');
  }
}
