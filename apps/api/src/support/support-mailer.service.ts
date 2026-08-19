import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SupportMessage } from '@pos/database';
import { MailerService } from '../common/mailer/mailer.service';

// Capa fina sobre MailerService: solo arma el asunto/cuerpo del aviso de un
// mensaje de soporte nuevo. El envío en sí (config SMTP, no-op si falta,
// nunca lanza) vive en el servicio genérico.
@Injectable()
export class SupportMailerService {
  constructor(
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
  ) {}

  async notifyNewMessage(msg: SupportMessage): Promise<void> {
    const notifyEmail = this.config.get<string>('SUPPORT_NOTIFY_EMAIL');
    if (!notifyEmail) return; // sin destinatario configurado, nada que hacer

    const categoryLabel =
      msg.category === 'PREMIUM_INTEREST' ? 'Quiere pasar a Premium' : 'Duda técnica';

    await this.mailer.send({
      to: notifyEmail,
      subject: `[Soporte POS] ${categoryLabel}${msg.subject ? ` — ${msg.subject}` : ''}`,
      context: 'los mensajes de soporte',
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
  }
}
