import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  withTenantContext,
  Prisma,
  InvoiceType,
  InvoiceStatus,
  OrderStatus,
  type TransactionClient,
} from '@pos/database';
import { AFIP_GATEWAY, type AfipGateway } from '../afip/afip-gateway.interface';
import { buildFeCaeAmounts } from '../afip/fe-cae-amounts.util';
import { buildAfipQrUrl } from '../afip/qr.util';
import {
  determineInvoiceType,
  AFIP_CBTE_TIPO,
  AFIP_DOC_TIPO,
} from '../afip/invoice-type.util';
import type { CreateInvoiceDto } from './dto/create-invoice.dto';

const INVOICE_INCLUDE = {
  customer: true,
  order: { include: { items: true } },
} satisfies Prisma.InvoiceInclude;

const MAX_TICKET_NUMBER_ATTEMPTS = 3;

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    @Inject(AFIP_GATEWAY) private readonly afipGateway: AfipGateway,
  ) {}

  async issue(tenantId: string, dto: CreateInvoiceDto) {
    // Se extrae a una const antes de armar el closure de abajo: el
    // angostamiento de tipo de una propiedad no sobrevive dentro de un
    // arrow function que la vuelve a leer desde `dto`.
    const requestedType = dto.requestedType;
    if (!requestedType || requestedType === 'TICKET_X') {
      return this.issueTicketXWithRetry(tenantId, dto);
    }
    return withTenantContext(tenantId, (tx) =>
      this.issueFiscal(tx, tenantId, dto, requestedType),
    );
  }

  async findOne(tenantId: string, id: string) {
    return withTenantContext(tenantId, async (tx) => {
      const invoice = await tx.invoice.findFirst({
        where: { id, tenantId },
        include: INVOICE_INCLUDE,
      });
      if (!invoice) throw new NotFoundException('Comprobante no encontrado');
      return invoice;
    });
  }

  async findByOrder(tenantId: string, orderId: string) {
    return withTenantContext(tenantId, async (tx) => {
      const invoice = await tx.invoice.findUnique({
        where: { orderId },
        include: INVOICE_INCLUDE,
      });
      if (!invoice)
        throw new NotFoundException(
          'Esta orden todavía no tiene comprobante emitido',
        );
      return invoice;
    });
  }

  // Ticket X es numeración local (nunca AFIP) — se puede reintentar sin
  // riesgo si dos cajas concurrentes calculan el mismo próximo número.
  private async issueTicketXWithRetry(tenantId: string, dto: CreateInvoiceDto) {
    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_TICKET_NUMBER_ATTEMPTS; attempt++) {
      try {
        return await withTenantContext(tenantId, (tx) =>
          this.issueTicketX(tx, tenantId, dto),
        );
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          lastError = err;
          continue;
        }
        throw err;
      }
    }
    throw lastError;
  }

  private async issueTicketX(
    tx: TransactionClient,
    tenantId: string,
    dto: CreateInvoiceDto,
  ) {
    const { order, customer } = await this.loadOrderAndCustomer(
      tx,
      tenantId,
      dto,
    );
    const amounts = buildFeCaeAmounts(order.items);
    const cbteNro = await this.getNextTicketNumber(tx, order.storeId);

    return tx.invoice.create({
      data: {
        tenantId,
        storeId: order.storeId,
        orderId: order.id,
        customerId: customer?.id,
        invoiceType: InvoiceType.TICKET_X,
        ptoVta: 0, // Ticket X no tiene punto de venta AFIP asociado
        cbteNro,
        status: InvoiceStatus.ISSUED,
        subtotalNeto:
          amounts.importeNeto +
          amounts.importeExento +
          amounts.importeNoGravado,
        vatAmount: amounts.importeIva,
        total: amounts.importeTotal,
        issuedAt: new Date(),
      },
      include: INVOICE_INCLUDE,
    });
  }

  // Facturas A/B/C reales — un solo intento. A diferencia de Ticket X, acá
  // NO conviene reintentar automáticamente ante un conflicto: si AFIP ya
  // otorgó un CAE y el guardado local falla, reintentar podría pedirle a
  // AFIP un segundo comprobante real duplicado. Ver el catch de abajo:
  // ante cualquier falla después de tener un CAE, se deja rastro explícito
  // en vez de perderlo en silencio.
  private async issueFiscal(
    tx: TransactionClient,
    tenantId: string,
    dto: CreateInvoiceDto,
    requestedType: 'FACTURA_A' | 'FACTURA_B',
  ) {
    const { order, customer } = await this.loadOrderAndCustomer(
      tx,
      tenantId,
      dto,
    );

    const fiscalConfig = await tx.fiscalConfig.findFirst({
      where: { storeId: order.storeId, tenantId },
    });
    if (!fiscalConfig) {
      throw new BadRequestException(
        'El local no tiene configuración fiscal cargada — no se puede facturar',
      );
    }

    const finalType = determineInvoiceType(
      fiscalConfig.taxCondition,
      customer?.taxCondition,
    );
    if (requestedType === 'FACTURA_A' && finalType !== InvoiceType.FACTURA_A) {
      throw new BadRequestException(
        fiscalConfig.taxCondition === 'MONOTRIBUTO'
          ? 'Un emisor Monotributo no puede emitir Factura A'
          : 'Factura A requiere un cliente Responsable Inscripto con CUIT válido',
      );
    }

    const docTipo =
      customer?.docType === 'CUIT'
        ? AFIP_DOC_TIPO.CUIT
        : customer?.docType === 'DNI'
          ? AFIP_DOC_TIPO.DNI
          : customer?.docType === 'PASAPORTE'
            ? AFIP_DOC_TIPO.PASAPORTE
            : AFIP_DOC_TIPO.FINAL_CONSUMER;
    const docNro = customer?.docNumber ? Number(customer.docNumber) : 0;

    if (
      finalType === InvoiceType.FACTURA_A &&
      (docTipo !== AFIP_DOC_TIPO.CUIT || !docNro)
    ) {
      throw new BadRequestException('Factura A requiere el CUIT del cliente');
    }

    const amounts = buildFeCaeAmounts(order.items);
    const cbteTipo = AFIP_CBTE_TIPO[finalType];
    const credential = {
      storeId: fiscalConfig.storeId,
      cuit: fiscalConfig.cuit,
      ptoVta: fiscalConfig.ptoVta,
      crtCertificate: fiscalConfig.crtCertificate,
      keyCertificate: fiscalConfig.keyCertificate,
      isProduction: fiscalConfig.isProduction,
    };

    const baseData = {
      tenantId,
      storeId: order.storeId,
      orderId: order.id,
      customerId: customer?.id,
      invoiceType: finalType,
      ptoVta: fiscalConfig.ptoVta,
      subtotalNeto:
        amounts.importeNeto + amounts.importeExento + amounts.importeNoGravado,
      vatAmount: amounts.importeIva,
      total: amounts.importeTotal,
    };

    let cbteNro: number;
    let result: Awaited<ReturnType<AfipGateway['solicitarCae']>>;
    try {
      const lastNro = await this.afipGateway.getLastVoucherNumber(
        credential,
        cbteTipo,
      );
      cbteNro = lastNro + 1;
      result = await this.afipGateway.solicitarCae(credential, {
        cbteTipo,
        docTipo,
        docNro,
        cbteNro,
        importeTotal: amounts.importeTotal,
        importeNeto: amounts.importeNeto,
        importeIva: amounts.importeIva,
        importeExento: amounts.importeExento,
        importeNoGravado: amounts.importeNoGravado,
        alicuotas: amounts.alicuotas,
      });
    } catch (err) {
      this.logger.error(
        `Fallo de conectividad/protocolo con AFIP al facturar orden ${order.id}: ${String(err)}`,
      );
      return tx.invoice.create({
        data: {
          ...baseData,
          status: InvoiceStatus.REJECTED,
          errorMessage: `Error de conexión con AFIP: ${String(err)}`,
        },
        include: INVOICE_INCLUDE,
      });
    }

    if (!result.approved) {
      return tx.invoice.create({
        data: {
          ...baseData,
          status: InvoiceStatus.REJECTED,
          errorMessage: result.observaciones,
          afipResponse: result.raw as Prisma.InputJsonValue,
        },
        include: INVOICE_INCLUDE,
      });
    }

    const qrUrl = buildAfipQrUrl({
      fecha: new Date().toISOString().slice(0, 10),
      cuit: Number(fiscalConfig.cuit),
      ptoVta: fiscalConfig.ptoVta,
      tipoCmp: cbteTipo,
      nroCmp: cbteNro,
      importe: amounts.importeTotal,
      moneda: 'PES',
      ctz: 1,
      tipoDocRec: docTipo,
      nroDocRec: docNro,
      tipoCodAut: 'E',
      codAut: Number(result.cae),
    });

    return tx.invoice.create({
      data: {
        ...baseData,
        cbteNro,
        cae: result.cae,
        caeVto: result.caeVto,
        afipQrUrl: qrUrl,
        status: InvoiceStatus.ISSUED,
        afipResponse: result.raw as Prisma.InputJsonValue,
        issuedAt: new Date(),
      },
      include: INVOICE_INCLUDE,
    });
  }

  private async loadOrderAndCustomer(
    tx: TransactionClient,
    tenantId: string,
    dto: CreateInvoiceDto,
  ) {
    const order = await tx.order.findFirst({
      where: { id: dto.orderId, tenantId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Orden no encontrada');
    if (order.status === OrderStatus.CANCELLED) {
      throw new BadRequestException('No se puede facturar una orden cancelada');
    }

    const existing = await tx.invoice.findUnique({
      where: { orderId: order.id },
    });
    if (existing)
      throw new ConflictException('Esta orden ya tiene un comprobante emitido');

    const customer = dto.customerId
      ? await tx.customer.findFirst({ where: { id: dto.customerId, tenantId } })
      : null;
    if (dto.customerId && !customer)
      throw new NotFoundException('Cliente no encontrado');

    return { order, customer };
  }

  private async getNextTicketNumber(
    tx: TransactionClient,
    storeId: string,
  ): Promise<number> {
    const result = await tx.invoice.aggregate({
      where: { storeId, invoiceType: InvoiceType.TICKET_X },
      _max: { cbteNro: true },
    });
    return (result._max.cbteNro ?? 0) + 1;
  }
}
