import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [
    PassportModule,
    // Para setear el período de prueba al dar de alta un tenant.
    BillingModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  // AuthService se reexporta para DemoModule: la provisión de un tenant demo
  // reusa registerTenant/generateTokens en vez de duplicar el baile de RLS.
  exports: [AuthService],
})
export class AuthModule {}
