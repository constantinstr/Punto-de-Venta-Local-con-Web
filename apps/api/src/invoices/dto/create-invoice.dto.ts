import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

const REQUESTED_TYPES = ['TICKET_X', 'FACTURA_A', 'FACTURA_B'] as const;
export type RequestedInvoiceType = (typeof REQUESTED_TYPES)[number];

export class CreateInvoiceDto {
  @IsString()
  @MinLength(1)
  orderId!: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  // Factura C no es seleccionable: la determina el servidor solo si el
  // emisor es Monotributo, nunca es una preferencia del cajero.
  @IsOptional()
  @IsIn(REQUESTED_TYPES)
  requestedType?: RequestedInvoiceType;
}
