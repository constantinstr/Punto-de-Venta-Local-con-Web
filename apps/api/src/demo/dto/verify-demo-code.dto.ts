import { IsEmail, Matches } from 'class-validator';

export class VerifyDemoCodeDto {
  @IsEmail()
  email!: string;

  @Matches(/^\d{6}$/, { message: 'El código debe tener 6 dígitos' })
  code!: string;
}
