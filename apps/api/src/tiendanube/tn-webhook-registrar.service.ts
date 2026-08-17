import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  TIENDANUBE_GATEWAY,
  type TiendanubeGateway,
  type TnCredentialInput,
} from './tiendanube-gateway.interface';
import {
  WEBHOOK_TOKEN_PURPOSE,
  type TnWebhookToken,
} from './tn-webhook.controller';

// Los eventos que se dan de alta. Solo order/paid descuenta stock (ver
// STOCK_EVENTS en el controller); si más adelante se suman otros, van acá.
const EVENTS = ['order/paid'];

// A diferencia de WooCommerce —donde el comerciante pega la URL a mano en el
// panel de WordPress— en Tienda Nube los webhooks se dan de alta por API con
// el token de esa tienda. Así que registrarlos es parte de "conectar".
@Injectable()
export class TnWebhookRegistrarService {
  private readonly logger = new Logger(TnWebhookRegistrarService.name);

  constructor(
    @Inject(TIENDANUBE_GATEWAY) private readonly gateway: TiendanubeGateway,
    private readonly config: ConfigService,
    private readonly jwtService: JwtService,
  ) {}

  // El token va en la URL y no vence: si venciera, los webhooks registrados
  // dejarían de funcionar en silencio meses después de conectar. Lo que lo
  // hace seguro es que no otorga nada por sí solo — el endpoint igual exige la
  // firma HMAC del body, y el token solo dice a qué tenant pertenece el
  // evento. Se invalida desconectando la integración (el configId deja de
  // resolver).
  async buildWebhookUrl(tenantId: string, configId: string): Promise<string> {
    const apiUrl =
      this.config.get<string>('API_PUBLIC_URL') ?? 'http://localhost:3001';

    const token = await this.jwtService.signAsync({
      tenantId,
      configId,
      purpose: WEBHOOK_TOKEN_PURPOSE,
    } satisfies TnWebhookToken);

    return `${apiUrl}/webhooks/tiendanube?t=${encodeURIComponent(token)}`;
  }

  // Idempotente: se puede llamar cuantas veces haga falta. Borra los webhooks
  // nuestros que apunten a una URL vieja (pasa al mover el servidor o al
  // reconectar) y crea los que falten. Nunca toca webhooks de otras apps.
  //
  // Nunca lanza: si Tienda Nube está caída justo cuando el comerciante
  // conecta, la conexión igual queda guardada y los webhooks se pueden
  // reintentar después desde la pantalla.
  async sync(
    tenantId: string,
    configId: string,
    credential: TnCredentialInput,
  ): Promise<{ registered: string[]; error?: string }> {
    try {
      const url = await this.buildWebhookUrl(tenantId, configId);
      const existing = await this.gateway.listWebhooks(credential);

      for (const hook of existing) {
        const esNuestro = hook.url.includes('/webhooks/tiendanube');
        if (esNuestro && (hook.url !== url || !EVENTS.includes(hook.event))) {
          await this.gateway.deleteWebhook(credential, hook.id);
        }
      }

      const vigentes = await this.gateway.listWebhooks(credential);
      const registered: string[] = [];
      for (const event of EVENTS) {
        const yaEsta = vigentes.some((h) => h.event === event && h.url === url);
        if (yaEsta) continue;
        await this.gateway.createWebhook(credential, event, url);
        registered.push(event);
      }

      return { registered };
    } catch (err) {
      this.logger.error(
        `No se pudieron registrar los webhooks de Tienda Nube (tenant=${tenantId}, config=${configId}): ${String(err)}`,
      );
      return { registered: [], error: String(err) };
    }
  }
}
