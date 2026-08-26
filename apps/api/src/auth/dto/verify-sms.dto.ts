import { IsNotEmpty, IsString } from 'class-validator';

export class VerifySmsDto {
  @IsString()
  @IsNotEmpty({ message: 'PHONE_REQUIRED' })
  phone!: string;

  @IsString()
  @IsNotEmpty({ message: 'CODE_REQUIRED' })
  code!: string;
}
