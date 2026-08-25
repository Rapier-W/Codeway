import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class CreateEmergencyContactDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  name!: string;

  @IsString()
  @Matches(/^1\d{10}$/, { message: 'EMERGENCY_CONTACT_PHONE_INVALID' })
  phone!: string;
}
