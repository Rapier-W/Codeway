import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUserId } from '../common/current-user.decorator';
import { IdempotencyKey } from '../common/idempotency-key.decorator';
import { FarePlanService } from './fare-plan.service';
import { FarePlanDto } from './dto/fare-plan.dto';
import { FarePlanDecisionDto } from './dto/fare-plan-decision.dto';

@Controller('trips/:id/fare-plan')
export class FarePlanController {
  constructor(private readonly farePlan: FarePlanService) {}

  /** 获取行程当前费用方案。 */
  @Get()
  getFarePlan(@Param('id') tripId: string, @CurrentUserId(false) userId?: string) {
    return this.farePlan.getFarePlan(tripId);
  }

  /** 发单人发起费用方案变更。 */
  @Post('change-requests')
  createChangeRequest(
    @Param('id') tripId: string,
    @CurrentUserId() userId: string,
    @Body() dto: FarePlanDto,
    @IdempotencyKey() requestKey: string,
  ) {
    return this.farePlan.createChangeRequest(tripId, userId, dto, requestKey);
  }

  /** 成员表决费用方案变更。 */
  @Post('change-requests/:changeRequestId/decisions')
  decideChangeRequest(
    @Param('id') tripId: string,
    @Param('changeRequestId') changeRequestId: string,
    @CurrentUserId() userId: string,
    @Body() dto: FarePlanDecisionDto,
    @IdempotencyKey() requestKey: string,
  ) {
    return this.farePlan.decideChangeRequest(changeRequestId, userId, dto.decision as 'APPROVED' | 'REJECTED', requestKey);
  }

  /** 查看当前变更申请状态及各成员表决情况。 */
  @Get('change-requests/current')
  getCurrentChangeRequest(@Param('id') tripId: string, @CurrentUserId() userId: string) {
    return this.farePlan.getChangeRequest(tripId, userId);
  }
}
