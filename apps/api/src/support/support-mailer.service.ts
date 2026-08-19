import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { SupportMessage } from '@pos/database';

// Best-effort: este repo no tenía ningún mailer antes de esto (ver los
// comentarios en shared-types/index.ts y auth-store.ts que lo dicen
// explícitamente). En vez de exigir SMTP para poder levantar la API, si
// faltan las env vars simplemente no manda nada — guardar el mensaje en la
// base (SupportService) y verlo en /platform/support-messages sigue
// funcionando igual. Mismo criterio que TIENDANUBE_CLIENT_ID en
// tn-oauth.controller.ts: una integración ausente no es un error de arranque.
@Injectable()
export class SupportMailerService {
  private readonly logger = new Logger(SupportMailerService.name);
  private warnedOnce = false;

  constructor(private readonly config: ConfigService) {}

  private get isConfigured(): boolean {
    return Boolean(
      this.config.get('SMTP_HOST') &&
        this.config.get('SMTP_USER') &&
        this.config.get('SMTP_PASS') &&
        this.config.get('SUPPORT_NOTIFY_EMAIL'),
    );
  }

  async notifyNewMessage(msg: SupportMessage): Promise<void> {
    if (!this.isConfigured) {
      if (!this.warnedOnce) {
        this.warnedOnce = true;
        this.logger.warn(
          'SMTP_HOST/SMTP_USER/SMTP_PASS/SUPPORT_NOTIFY_EMAIL no están configurados — ' +
            'los mensajes de soporte se guardan en la base pero no se avisan por mail. ' +
            'Se pueden ver en /platform/support-messages.',
        );
      }
      return;
    }

    try {
      const transporter = nodemailer.createTransport({
        host: this.config.get<string>('SMTP_HOST'),
        port: Number(this.config.get('SMTP_PORT') ?? 587),
        secure: Number(this.config.get('SMTP_PORT') ?? 587) === 465,
        auth: {
          user: this.config.get<string>('SMTP_USER'),
          pass: this.config.get<string>('SMTP_PASS'),
        },
      });

      const categoryLabel =
        msg.category === 'PREMIUM_INTEREST'
          ? 'Quiere pasar a Premium'
          : 'Duda técnica';

      await transporter.sendMail({
        from: this.config.get<string>('SMTP_FROM') ?? this.config.get<string>('SMTP_USER'),
        to: this.config.get<string>('SUPPORT_NOTIFY_EMAIL'),
        subject: `[Soporte POS] ${categoryLabel}${msg.subject ? ` — ${msg.subject}` : ''}`,
        text: [
          `Categoría: ${categoryLabel}`,
          `De: ${msg.contactName ?? '(sin nombre)'} <${msg.contactEmail}>`,
          msg.tenantId ? `Tenant: ${msg.tenantId}` : null,
          '',
          msg.message,
        ]
          .filter((line) => line !== null)
          .join('\n'),
      });
    } catch (err) {
      // Nunca hacer fallar la creación del mensaje por un problema de mail
      // (SMTP caído, credenciales vencidas) — el mensaje ya quedó guardado.
      this.logger.error(`No se pudo enviar el mail de aviso: ${String(err)}`);
    }
  }
}
