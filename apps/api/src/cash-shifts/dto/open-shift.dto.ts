import { IsNumber, IsString, Min, MinLength } from 'class-validator';

export class OpenShiftDto {
  @IsString()
  @MinLength(1)
  cashRegisterId!: string;

  @IsNumber()
  @Min(0)
  initialAmount!: number;
}
