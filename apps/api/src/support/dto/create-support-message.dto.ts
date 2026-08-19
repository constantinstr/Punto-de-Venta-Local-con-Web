import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { SupportMessageCategory } from '@pos/database';

export class CreateSupportMessageDto {
  @IsEnum(SupportMessageCategory)
  category!: SupportMessageCategory;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  subject?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  message!: string;
}
