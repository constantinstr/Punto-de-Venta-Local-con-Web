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
import { PlanService } from '../billing/plan.service';
import { buildFeCaeAmounts } from '../afip/fe-cae-amounts.util';
import { buildAfipQrUrl } from '../afip/qr.util';
import {
  determineInvoiceType,
  resolveCondicionIvaReceptor,
  creditNoteTypeFor,
  CREDIT_NOTE_TYPES,
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
    private readonly planService: PlanService,
  ) {}

  async issue(tenantId: string, dto: CreateInvoiceDto) {
    // Se extrae a una const antes de armar el closure de abajo: el
    // angostamiento de tipo de una propiedad no sobrevive dentro de un
    // arrow function que la vuelve a leer desde `dto`.
    const requestedType = dto.requestedType;
    // El Ticket X (o la ausencia de requestedType) NUNCA pasa por acá: es el
    // comprobante interno no fiscal que necesita cualquier venta de
    // mostrador, demo o no. El cartel Premium bloquea solo la rama que pide
    // AFIP de verdad — si se bloqueara /invoices entero se rompería el
    // cobro normal del POS en la demo.
    if (!requestedType || requestedType === 'TICKET_X') {
      return this.issueTicketXWithRetry(tenantId, dto);
    }
    await this.planService.assertFeature(tenantId, 'FISCAL_INVOICING');
    return this.issueFiscal(tenantId, dto, requestedType);
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

  // Devuelve el comprobante DE VENTA de la orden, no su nota de crédito: es
  // lo que se reimprime desde el historial. La NC se consulta aparte.
  async findByOrder(tenantId: string, orderId: string) {
    return withTenantContext(tenantId, async (tx) => {
      const invoice = await tx.invoice.findFirst({
        where: {
          orderId,
          tenantId,
          invoiceType: { notIn: CREDIT_NOTE_TYPES },
        },
        include: INVOICE_INCLUDE,
      });
      if (!invoice)
        throw new NotFoundException(
          'Esta orden todavía no tiene comprobante emitido',
        );
      return invoice;
    });
  }

  // Emite la nota de crédito que anula una factura ya autorizada.
  //
  // MISMA ESTRUCTURA QUE issueFiscal Y POR EL MISMO MOTIVO: la ida y vuelta a
  // AFIP (WSAA + WSFE) puede tardar varios segundos, más que el timeout por
  // defecto de una transacción interactiva de Prisma (5s). Se carga y valida
  // en una transacción corta, se llama a AFIP FUERA de toda transacción, y se
  // persiste en una segunda transacción corta.
  //
  // A diferencia de issueFiscal, si AFIP rechaza esto LANZA en vez de
  // guardar un comprobante REJECTED: quien llama (la anulación de una venta)
  // tiene que poder abortar y no dejar la orden cancelada sin respaldo
  // fiscal. Además, no persistir el rechazo deja libre el índice único de
  // relatedInvoiceId para poder reintentar más tarde.
  async issueCreditNote(
    tenantId: string,
    originalInvoiceId: string,
  ): Promise<Awaited<ReturnType<typeof this.findOne>>> {
    // En la práctica esto ya es inalcanzable para un tenant demo (no puede
    // tener ningún Invoice ISSUED con CAE — el gate de arriba en issue()
    // se lo impide), pero se deja explícito por si el día de mañana aparece
    // otro camino que deje un comprobante ISSUED sin pasar por issue().
    await this.planService.assertFeature(tenantId, 'FISCAL_INVOICING');
    const prepared = await withTenantContext(tenantId, async (tx) => {
      const original = await tx.invoice.findFirst({
        where: { id: originalInvoiceId, tenantId },
        include: { customer: true, order: { include: { items: true } } },
      });
      if (!original) throw new NotFoundException('Comprobante no encontrado');

      if (original.status !== InvoiceStatus.ISSUED || !original.cae) {
        throw new BadRequestException(
          'Solo se puede anular por nota de crédito un comprobante autorizado por AFIP',
        );
      }

      const creditNoteType = creditNoteTypeFor(original.invoiceType);
      if (!creditNoteType) {
        throw new BadRequestException(
          `El comprobante ${original.invoiceType} no se anula por nota de crédito`,
        );
      }

      const alreadyVoided = await tx.invoice.findFirst({
        where: { relatedInvoiceId: original.id },
      });
      if (alreadyVoided) {
        throw new ConflictException(
          'Este comprobante ya fue anulado por una nota de crédito',
        );
      }

      const fiscalConfig = await tx.fiscalConfig.findFirst({
        where: { storeId: original.storeId, tenantId },
      });
      if (!fiscalConfig) {
        throw new BadRequestException(
          'El local ya no tiene configuración fiscal cargada — no se puede emitir la nota de crédito',
        );
      }

      return { original, creditNoteType, fiscalConfig };
    });

    const { original, creditNoteType, fiscalConfig } = prepared;

    // Se recalcula desde los ítems de la orden, que son inmutables una vez
    // creada: da exactamente los mismos importes que la factura original y,
    // además, provee el desglose de alícuotas que necesitan las NC A y B.
    const amounts = buildFeCaeAmounts(original.order.items);
    const cbteTipo = AFIP_CBTE_TIPO[creditNoteType];
    const customer = original.customer;

    const docTipo =
      customer?.docType === 'CUIT'
        ? AFIP_DOC_TIPO.CUIT
        : customer?.docType === 'DNI'
          ? AFIP_DOC_TIPO.DNI
          : customer?.docType === 'PASAPORTE'
            ? AFIP_DOC_TIPO.PASAPORTE
            : AFIP_DOC_TIPO.FINAL_CONSUMER;
    const docNro = customer?.docNumber ? Number(customer.docNumber) : 0;

    const credential = {
      storeId: fiscalConfig.storeId,
      cuit: fiscalConfig.cuit,
      ptoVta: fiscalConfig.ptoVta,
      crtCertificate: fiscalConfig.crtCertificate,
      keyCertificate: fiscalConfig.keyCertificate,
      isProduction: fiscalConfig.isProduction,
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
        condicionIvaReceptorId: resolveCondicionIvaReceptor(
          customer?.taxCondition,
        ),
        cbteNro,
        importeTotal: amounts.importeTotal,
        importeNeto: amounts.importeNeto,
        importeIva: amounts.importeIva,
        importeExento: amounts.importeExento,
        importeNoGravado: amounts.importeNoGravado,
        alicuotas: amounts.alicuotas,
        // Lo que hace que AFIP sepa QUÉ comprobante se está anulando. El
        // Cuit es el del EMISOR del comprobante original (nosotros).
        cbtesAsoc: [
          {
            tipo: AFIP_CBTE_TIPO[original.invoiceType],
            ptoVta: original.ptoVta,
            nro: original.cbteNro!,
            cuit: fiscalConfig.cuit,
          },
        ],
      });
    } catch (err) {
      this.logger.error(
        `Fallo de conectividad/protocolo con AFIP al emitir nota de crédito de ${original.id}: ${String(err)}`,
      );
      throw new BadRequestException(
        `No se pudo emitir la nota de crédito: ${String(err)}`,
      );
    }

    if (!result.approved) {
      this.logger.error(
        `AFIP rechazó la nota de crédito de ${original.id}: ${result.observaciones}`,
      );
      throw new BadRequestException(
        `AFIP rechazó la nota de crédito: ${result.observaciones}`,
      );
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

    return withTenantContext(tenantId, (tx) =>
      tx.invoice.create({
        data: {
          tenantId,
          storeId: original.storeId,
          orderId: original.orderId,
          customerId: original.customerId,
          relatedInvoiceId: original.id,
          invoiceType: creditNoteType,
          ptoVta: fiscalConfig.ptoVta,
          cbteNro,
          cae: result.cae,
          caeVto: result.caeVto,
          afipQrUrl: qrUrl,
          status: InvoiceStatus.ISSUED,
          subtotalNeto:
            amounts.importeNeto +
            amounts.importeExento +
            amounts.importeNoGravado,
          vatAmount: amounts.importeIva,
          total: amounts.importeTotal,
          afipResponse: result.raw as Prisma.InputJsonValue,
          issuedAt: new Date(),
        },
        include: INVOICE_INCLUDE,
      }),
    );
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
  // A diferencia de issueTicketX, esto NO corre entero dentro de una sola
  // transacción Prisma: la ida y vuelta real a AFIP (WSAA + WSFE) puede
  // tardar varios segundos, más que el timeout por defecto de una
  // transacción interactiva (5s) — si se supera, Prisma cierra la
  // transacción sola y hasta el catch que intenta guardar el motivo del
  // rechazo falla en cascada (visto en la práctica: un 500 crudo en vez de
  // un Invoice con status=REJECTED). Se carga/valida todo en una
  // transacción corta, se llama a AFIP fuera de cualquier transacción, y
  // se persiste el resultado en una segunda transacción corta.
  private async issueFiscal(
    tenantId: string,
    dto: CreateInvoiceDto,
    requestedType: 'FACTURA_A' | 'FACTURA_B',
  ) {
    const prepared = await withTenantContext(tenantId, async (tx) => {
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
      if (
        requestedType === 'FACTURA_A' &&
        finalType !== InvoiceType.FACTURA_A
      ) {
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

      return {
        order,
        customer,
        fiscalConfig,
        finalType,
        docTipo,
        docNro,
        // RG 5616: la condición del receptor frente al IVA es obligatoria.
        // Sin cliente identificado, consumidor final.
        condicionIvaReceptorId: resolveCondicionIvaReceptor(
          customer?.taxCondition,
        ),
      };
    });

    const {
      order,
      fiscalConfig,
      finalType,
      docTipo,
      docNro,
      condicionIvaReceptorId,
    } = prepared;
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
      customerId: prepared.customer?.id,
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
        condicionIvaReceptorId,
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
      return withTenantContext(tenantId, (tx) =>
        tx.invoice.create({
          data: {
            ...baseData,
            status: InvoiceStatus.REJECTED,
            errorMessage: `Error de conexión con AFIP: ${String(err)}`,
          },
          include: INVOICE_INCLUDE,
        }),
      );
    }

    if (!result.approved) {
      return withTenantContext(tenantId, (tx) =>
        tx.invoice.create({
          data: {
            ...baseData,
            status: InvoiceStatus.REJECTED,
            errorMessage: result.observaciones,
            afipResponse: result.raw as Prisma.InputJsonValue,
          },
          include: INVOICE_INCLUDE,
        }),
      );
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

    return withTenantContext(tenantId, (tx) =>
      tx.invoice.create({
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
      }),
    );
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

    // findFirst y no findUnique: orderId dejó de ser único al aparecer las
    // notas de crédito (una orden anulada tiene factura + NC). Se busca solo
    // el comprobante "de venta", excluyendo las NC.
    const existing = await tx.invoice.findFirst({
      where: {
        orderId: order.id,
        invoiceType: { notIn: CREDIT_NOTE_TYPES },
      },
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
