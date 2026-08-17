import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Logger,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { UserRole } from '@pos/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { requireTenant } from '../common/require-tenant';
import type { AuthUser } from '../common/types/auth-user';
import {
  TIENDANUBE_GATEWAY,
  type TiendanubeGateway,
} from './tiendanube-gateway.interface';
import { TnConfigService } from './tn-config.service';
import { TnWebhookRegistrarService } from './tn-webhook-registrar.service';

interface OAuthState {
  tenantId: string;
  storeId: string;
  purpose: typeof STATE_PURPOSE;
}

// El state se firma con el mismo secreto que los tokens de sesión, y un
// access token también lleva tenantId adentro. Sin esta marca, alguien podría
// pegar su propio token de sesión como `state` y el callback lo aceptaría.
// Se verifica explícitamente al volver.
const STATE_PURPOSE = 'tiendanube-oauth';

// El `state` de OAuth acá NO es solo anti-CSRF: es lo único que dice a qué
// comercio y a qué local pertenece la autorización. El callback de Tienda
// Nube llega SIN sesión (es una redirección desde su sitio, sin nuestro
// header Authorization), así que si el state no viniera firmado, cualquiera
// podría llamar al callback y colgar una tienda ajena de su propio local.
//
// Se firma como JWT con vencimiento corto: una autorización que quedó a medias
// hace media hora no debería poder completarse después.
const STATE_TTL = '15m';

@Controller('integrations/tiendanube')
export class TnOAuthController {
  private readonly logger = new Logger(TnOAuthController.name);

  constructor(
    private readonly config: ConfigService,
    private readonly jwtService: JwtService,
    private readonly tnConfigService: TnConfigService,
    private readonly webhookRegistrar: TnWebhookRegistrarService,
    @Inject(TIENDANUBE_GATEWAY) private readonly gateway: TiendanubeGateway,
  ) {}

  // Devuelve la URL a la que hay que mandar al comerciante. No redirige desde
  // acá: el front necesita hacer la navegación de nivel superior, y además
  // así el endpoint sigue siendo una llamada autenticada normal.
  @Get('authorize-url')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  async getAuthorizeUrl(
    @CurrentUser() user: AuthUser,
    @Query('storeId') storeId: string,
  ) {
    if (!storeId) throw new BadRequestException('Falta el local (storeId)');

    const clientId = this.config.get<string>('TIENDANUBE_CLIENT_ID');
    if (!clientId) {
      throw new BadRequestException(
        'Tienda Nube todavía no está habilitado en este servidor. Falta configurar la aplicación de partner.',
      );
    }

    const state = await this.jwtService.signAsync(
      {
        tenantId: requireTenant(user),
        storeId,
        purpose: STATE_PURPOSE,
      } satisfies OAuthState,
      { expiresIn: STATE_TTL },
    );

    return {
      url: `https://www.tiendanube.com/apps/${clientId}/authorize?state=${encodeURIComponent(state)}`,
    };
  }

  // Público: lo invoca el navegador del comerciante al volver de Tienda Nube.
  // Nunca confía en nada del query salvo lo que pueda verificar.
  @Get('callback')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const appUrl =
      this.config.get<string>('APP_PUBLIC_URL') ?? 'http://localhost:3000';
    const destino = `${appUrl}/settings/integrations/tiendanube`;

    if (!code || !state) {
      res.redirect(`${destino}?error=faltan_parametros`);
      return;
    }

    let payload: OAuthState;
    try {
      payload = await this.jwtService.verifyAsync<OAuthState>(state);
    } catch {
      this.logger.warn('Callback de Tienda Nube con state inválido o vencido');
      res.redirect(`${destino}?error=autorizacion_vencida`);
      return;
    }

    // Ver el comentario de STATE_PURPOSE: sin este chequeo, un token de
    // sesión cualquiera serviría como state.
    if (payload.purpose !== STATE_PURPOSE || !payload.storeId) {
      this.logger.warn(
        'Callback de Tienda Nube con un state que no es de OAuth',
      );
      res.redirect(`${destino}?error=autorizacion_invalida`);
      return;
    }

    try {
      const { accessToken, tnStoreId, scopes } =
        await this.gateway.exchangeCode(code);

      const config = await this.tnConfigService.saveFromOAuth({
        tenantId: payload.tenantId,
        storeId: payload.storeId,
        tnStoreId,
        accessToken,
        scopes,
      });

      // Los webhooks de Tienda Nube se dan de alta por API con el token de la
      // tienda, no en el panel de partner: registrarlos es parte de conectar.
      // Best-effort a propósito — si falla, la conexión ya quedó guardada y se
      // reintenta desde la pantalla (POST .../webhooks/register).
      await this.webhookRegistrar.sync(payload.tenantId, config.id, {
        tnStoreId,
        accessToken,
      });

      this.logger.log(
        `Tienda Nube conectada (tenant=${payload.tenantId}, local=${payload.storeId}, tienda=${tnStoreId})`,
      );
      res.redirect(`${destino}?conectado=1`);
    } catch (err) {
      this.logger.error(`Falló la conexión con Tienda Nube: ${String(err)}`);
      res.redirect(`${destino}?error=no_se_pudo_conectar`);
    }
  }
}
