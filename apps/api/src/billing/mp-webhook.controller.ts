import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Query,
  Body,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { verifyMpWebhookSignature } from './mp-signature.util';
import { SubscriptionService } from './subscription.service';
import { MercadoPagoService } from './mercadopago.service';

interface MpWebhookBody {
  type?: string;
  action?: string;
  data?: { id?: string };
}

// Endpoint público (sin JWT) donde Mercado Pago avisa los cambios de
// suscripción y los pagos. La URL se configura en el panel de MP
// (Tus integraciones → Webhooks) apuntando a:
//   https://<API_PUBLIC_URL>/webhooks/mercadopago
// con los temas `subscription_preapproval`, `subscription_authorized_payment`
// y `payments` habilitados.
@Controller('webhooks/mercadopago')
export class MpWebhookController {
  private readonly logger = new Logger(MpWebhookController.name);

  constructor(
    private readonly config: ConfigService,
    private readonly subscriptionService: SubscriptionService,
    private readonly mercadoPago: MercadoPagoService,
  ) {}

  // Público y sin JWT: se le pone un límite propio y bajo, porque MP puede
  // reintentar agresivo ante una falla y no queremos que eso se coma la
  // cuota del tráfico normal de la API (mismo criterio que el webhook de
  // WooCommerce).
  @Post()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async handle(
    @Body() body: MpWebhookBody,
    @Headers('x-signature') xSignature: string | undefined,
    @Headers('x-request-id') xRequestId: string | undefined,
    @Query('data.id') queryDataId: string | undefined,
    @Query('type') queryType: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ received: boolean }> {
    const secret = this.config.get<string>('MP_WEBHOOK_SECRET');
    if (!secret) {
      // Sin secreto configurado no hay forma de distinguir un webhook real de
      // uno falsificado. Se rechaza en vez de procesar a ciegas.
      this.logger.error(
        'Llegó un webhook de Mercado Pago pero falta MP_WEBHOOK_SECRET — se descarta',
      );
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
      return { received: false };
    }

    const dataId = queryDataId ?? body?.data?.id;

    if (!verifyMpWebhookSignature({ xSignature, xRequestId, dataId, secret })) {
      this.logger.warn(
        `Webhook de Mercado Pago con firma inválida (requestId=${xRequestId ?? 'n/d'}) — descartado`,
      );
      res.status(HttpStatus.UNAUTHORIZED);
      return { received: false };
    }

    const topic = queryType ?? body?.type ?? '';
    if (!dataId) {
      res.status(HttpStatus.BAD_REQUEST);
      return { received: false };
    }

    try {
      await this.dispatch(topic, dataId);
    } catch (err) {
      // Se responde 200 igual: el evento quedó logueado y un 5xx haría que MP
      // reintente en loop por un error nuestro que el reintento no arregla.
      // Los casos que sí conviene reintentar (MP caído) ya devuelven 502 antes.
      this.logger.error(
        `Error procesando webhook de Mercado Pago (topic=${topic}, dataId=${dataId}): ${String(err)}`,
      );
    }

    return { received: true };
  }

  private async dispatch(topic: string, dataId: string): Promise<void> {
    // Regla central: el webhook es SOLO un aviso de "algo cambió". Nunca se
    // confía en los montos ni en el estado que trae el body — se re-consulta
    // el recurso a la API de Mercado Pago, que es la fuente autoritativa. Sin
    // esto, un body falsificado que pasara la firma podría regalar meses.
    if (topic.includes('subscription_preapproval')) {
      const preapproval = await this.mercadoPago.getPreapproval(dataId);
      const tenantId = await this.resolveTenantId(
        preapproval.external_reference,
        dataId,
      );
      if (!tenantId) return;

      await this.subscriptionService.applyPreapprovalStatus({
        tenantId,
        preapprovalId: preapproval.id,
        mpStatus: preapproval.status,
        payload: preapproval,
      });
      return;
    }

    if (topic.includes('subscription_authorized_payment')) {
      const payment = await this.mercadoPago.getAuthorizedPayment(dataId);
      const tenantId = await this.resolveTenantId(
        payment.external_reference,
        payment.preapproval_id,
      );
      if (!tenantId) return;

      await this.subscriptionService.applyPayment({
        tenantId,
        mpPaymentId: String(payment.payment?.id ?? payment.id),
        amount: payment.transaction_amount ?? null,
        status: payment.payment?.status ?? payment.status ?? 'unknown',
        payload: payment,
      });
      return;
    }

    this.logger.log(
      `Webhook de Mercado Pago ignorado (topic no manejado: ${topic})`,
    );
  }

  // external_reference lleva el tenantId (lo seteamos al crear el
  // preapproval). Si por algún motivo no viene, se cae al vínculo guardado
  // en Tenant.mpPreapprovalId.
  private async resolveTenantId(
    externalReference: string | undefined,
    preapprovalId: string | undefined,
  ): Promise<string | null> {
    if (externalReference) return externalReference;
    if (!preapprovalId) return null;

    const tenant =
      await this.subscriptionService.findTenantByPreapproval(preapprovalId);
    if (!tenant) {
      this.logger.warn(
        `Webhook de Mercado Pago sin tenant identificable (preapproval=${preapprovalId})`,
      );
      return null;
    }
    return tenant.id;
  }
}
