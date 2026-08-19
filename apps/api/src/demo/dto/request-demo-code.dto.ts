import { IsEmail } from 'class-validator';

export class RequestDemoCodeDto {
  @IsEmail()
  email!: string;
}
