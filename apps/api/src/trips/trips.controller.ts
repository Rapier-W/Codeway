import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUserId } from '../common/current-user.decorator';
import { IdempotencyKey } from '../common/idempotency-key.decorator';
import { CreateTripDto } from './dto/create-trip.dto';
import { JoinTripDto } from './dto/join-trip.dto';
import { ListTripsDto } from './dto/list-trips.dto';
import { ListMyTripsDto } from './dto/list-my-trips.dto';
import { TripsService } from './trips.service';
import { ConfirmationService } from './confirmation.service';

@Controller('trips')
export class TripsController {
  constructor(private readonly trips: TripsService, private readonly confirmations: ConfirmationService) {}

  @Post()
  create(@CurrentUserId() userId: string, @Body() dto: CreateTripDto, @IdempotencyKey(false) idempotencyKey?: string) {
    return this.trips.create(userId, dto, idempotencyKey);
  }

  // 列表和详情允许匿名浏览。
  @Get()
  list(@Query() dto: ListTripsDto) {
    return this.trips.list(dto);
  }

  @Get('mine')
  listMine(@CurrentUserId() userId: string, @Query() dto: ListMyTripsDto) {
    return this.trips.listMine(userId, dto.role);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.trips.findOne(id);
  }

  @Post(':id/join')
  join(@Param('id') id: string, @CurrentUserId() userId: string, @Body() dto: JoinTripDto, @IdempotencyKey() idempotencyKey: string) {
    return this.trips.join(userId, id, dto, idempotencyKey);
  }

  @Post(':id/confirmations')
  confirm(@Param('id') id: string, @CurrentUserId() userId: string, @IdempotencyKey() idempotencyKey: string) {
    return this.confirmations.confirm(id, userId, idempotencyKey);
  }

  @Post(':id/confirmations/:confirmationId/withdraw')
  withdraw(@Param('id') id: string, @Param('confirmationId') confirmationId: string, @CurrentUserId() userId: string) {
    return this.confirmations.withdraw(id, confirmationId, userId);
  }
}
