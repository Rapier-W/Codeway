import { IsNotEmpty, IsString } from 'class-validator';

export class SendSmsDto {
  @IsString()
  @IsNotEmpty({ message: 'PHONE_REQUIRED' })
  phone!: string;
}
