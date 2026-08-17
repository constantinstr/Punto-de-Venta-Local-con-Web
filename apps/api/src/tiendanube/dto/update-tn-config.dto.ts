import { IsBoolean, IsOptional } from 'class-validator';

// Solo interruptores. Ni el token ni el id de la tienda se editan a mano: los
// establece el flujo de OAuth, y tocarlos dejaría la integración apuntando a
// otra tienda o directamente rota.
export class UpdateTnConfigDto {
  @IsOptional()
  @IsBoolean()
  syncStockOutbound?: boolean;

  @IsOptional()
  @IsBoolean()
  syncStockInbound?: boolean;

  @IsOptional()
  @IsBoolean()
  syncPriceOutbound?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
