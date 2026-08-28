import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUserId } from '../common/current-user.decorator';
import { IdempotencyKey } from '../common/idempotency-key.decorator';
import { FarePlanService } from './fare-plan.service';
import { CreateFarePlanChangeRequestDto, FarePlanDecisionDto } from './dto/fare-plan.dto';

@Controller()
export class FarePlanController {
  constructor(private readonly service: FarePlanService) {}
  @Get('trips/:tripId/fare-plan') get(@Param('tripId') tripId: string, @CurrentUserId() userId: string) { return this.service.getFarePlan(tripId, userId); }
  @Post('trips/:tripId/fare-plan-change-requests') create(@Param('tripId') tripId: string, @CurrentUserId() userId: string, @Body() dto: CreateFarePlanChangeRequestDto, @IdempotencyKey() key: string) { return this.service.createChangeRequest(tripId, userId, dto, key); }
  @Post('fare-plan-change-requests/:id/decisions') decide(@Param('id') id: string, @CurrentUserId() userId: string, @Body() dto: FarePlanDecisionDto, @IdempotencyKey() key: string) { return this.service.decideChangeRequest(id, userId, dto, key); }
  @Post('trips/:tripId/fare-plan-revisions/:revisionId/confirm') confirm(@Param('tripId') tripId: string, @Param('revisionId') revisionId: string, @CurrentUserId() userId: string, @IdempotencyKey() key: string) { return this.service.confirmRevision(tripId, revisionId, userId, key); }
}
