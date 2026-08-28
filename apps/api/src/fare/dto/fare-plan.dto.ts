import { IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class FarePlanDto {
  @IsIn(['EQUAL', 'FIXED', 'CUSTOM']) mode!: string;
  @IsOptional() @IsObject() allocations?: Record<string, number>;
}
export class CreateFarePlanChangeRequestDto {
  @IsObject() proposedPlan!: FarePlanDto;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
export class FarePlanDecisionDto { @IsIn(['APPROVED', 'REJECTED']) decision!: string; }
