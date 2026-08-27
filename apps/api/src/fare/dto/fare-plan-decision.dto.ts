import { IsIn } from 'class-validator';

export class FarePlanDecisionDto {
  @IsIn(['APPROVED', 'REJECTED'], { message: 'FARE_PLAN_DECISION_INVALID' })
  decision!: string;
}
