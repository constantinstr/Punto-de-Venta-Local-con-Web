import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { FiscalTaxCondition } from '@pos/database';

// storeId NO se puede cambiar: la configuración fiscal está atada al local
// que ya emitió comprobantes con ese punto de venta. Mover eso rompería la
// correlatividad ante AFIP.
//
// El certificado y la clave son opcionales para poder editar solo los datos
// (razón social, ingresos brutos) sin volver a subir los archivos. Si viene
// uno, tiene que venir el otro: un certificado nuevo con la clave vieja no
// firma nada — ver FiscalConfigService.update.
export class UpdateFiscalConfigDto {
  @IsOptional()
  @IsString()
  @MinLength(11)
  cuit?: string;

  @IsOptional()
  @IsEnum(FiscalTaxCondition)
  taxCondition?: FiscalTaxCondition;

  @IsOptional()
  @IsString()
  grossIncomeNumber?: string;

  @IsOptional()
  @IsDateString()
  activityStartDate?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  ptoVta?: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  crtCertificate?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  keyCertificate?: string;

  @IsOptional()
  @IsBoolean()
  isProduction?: boolean;
}
