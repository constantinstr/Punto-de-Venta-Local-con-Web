import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AfipAuthService } from './afip-auth.service';
import { AfipSoapGateway } from './afip-soap.gateway';
import { AfipMockGateway } from './afip-mock.gateway';
import { AFIP_GATEWAY } from './afip-gateway.interface';

// AFIP_GATEWAY apunta al gateway real por defecto. Con AFIP_MOCK=true en
// el entorno (útil para desarrollo sin certificados a mano) usa el mock.
// Los tests e2e no dependen de esta variable — overridean el token
// directamente vía Nest Testing Module (ver test/invoices.e2e-spec.ts).
@Module({
  imports: [ConfigModule],
  providers: [
    AfipAuthService,
    AfipSoapGateway,
    AfipMockGateway,
    {
      provide: AFIP_GATEWAY,
      inject: [ConfigService, AfipSoapGateway, AfipMockGateway],
      useFactory: (
        config: ConfigService,
        soapGateway: AfipSoapGateway,
        mockGateway: AfipMockGateway,
      ) =>
        config.get<string>('AFIP_MOCK') === 'true' ? mockGateway : soapGateway,
    },
  ],
  exports: [AFIP_GATEWAY],
})
export class AfipModule {}
