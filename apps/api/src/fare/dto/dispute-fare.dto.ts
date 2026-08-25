import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class DisputeFareDto {
  @IsString()
  @IsNotEmpty({ message: 'DISPUTE_REASON_REQUIRED' })
  @MaxLength(500)
  reason!: string;
}
