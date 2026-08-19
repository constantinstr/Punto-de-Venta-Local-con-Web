import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

// Best-effort y genérico: este repo no tenía ningún mailer hasta el módulo
// de soporte (ver los comentarios en shared-types/index.ts y auth-store.ts
// que lo decían explícitamente). Ahora lo usan dos consumidores (avisos de
// SupportService y el código de verificación de DemoService), de ahí que
// viva acá como servicio compartido en vez de duplicar la config SMTP.
//
// Sigue sin exigir SMTP para poder levantar la API: si faltan las env vars,
// `send()` devuelve `false` y cada caller decide su propio fallback (loguear
// el contenido, por ejemplo) — nunca tira una excepción que pueda tumbar el
// flujo que lo llamó.
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private warnedOnce = false;

  constructor(private readonly config: ConfigService) {}

  get isConfigured(): boolean {
    return Boolean(
      this.config.get('SMTP_HOST') &&
      this.config.get('SMTP_USER') &&
      this.config.get('SMTP_PASS'),
    );
  }

  private warnOnceIfUnconfigured(context: string): void {
    if (this.warnedOnce) return;
    this.warnedOnce = true;
    this.logger.warn(
      `SMTP_HOST/SMTP_USER/SMTP_PASS no están configurados — ${context} no se manda por mail (ver .env.example).`,
    );
  }

  // Devuelve true si se pudo mandar (o al menos se intentó sin excepción),
  // false si no había config o falló el envío — nunca lanza.
  async send(params: {
    to: string;
    subject: string;
    text: string;
    html?: string; // opcional: si falta, el cliente de mail muestra solo `text`
    context: string; // para el warning de "no configurado", ej. "los mensajes de soporte"
  }): Promise<boolean> {
    if (!this.isConfigured) {
      this.warnOnceIfUnconfigured(params.context);
      return false;
    }

    try {
      const port = Number(this.config.get('SMTP_PORT') ?? 587);
      const transporter = nodemailer.createTransport({
        host: this.config.get<string>('SMTP_HOST'),
        port,
        secure: port === 465,
        auth: {
          user: this.config.get<string>('SMTP_USER'),
          pass: this.config.get<string>('SMTP_PASS'),
        },
      });

      await transporter.sendMail({
        from:
          this.config.get<string>('SMTP_FROM') ??
          this.config.get<string>('SMTP_USER'),
        to: params.to,
        subject: params.subject,
        text: params.text,
        html: params.html,
      });
      return true;
    } catch (err) {
      // Nunca hacer fallar al caller por un problema de mail (SMTP caído,
      // credenciales vencidas) — cada caller ya decidió qué hacer si no se
      // pudo mandar (loguear, etc.) antes de invocar send().
      this.logger.error(
        `No se pudo enviar el mail (${params.context}): ${String(err)}`,
      );
      return false;
    }
  }
}
