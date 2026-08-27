import { IsIn, IsInt, IsObject, IsOptional, IsString, Min } from 'class-validator';

export class FarePlanDto {
  @IsIn(['EQUAL', 'FIXED', 'CUSTOM'], { message: 'FARE_PLAN_MODE_INVALID' })
  mode!: 'EQUAL' | 'FIXED' | 'CUSTOM';

  @IsOptional()
  @IsObject()
  allocations?: Record<string, number>;

  @IsOptional()
  @IsInt({ message: 'FARE_AMOUNT_INVALID' })
  @Min(0, { message: 'FARE_AMOUNT_INVALID' })
  amountCents?: number;
}
