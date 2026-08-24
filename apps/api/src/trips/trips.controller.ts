import { Body, Controller, Get, Headers, Param, Post, Query, Req } from '@nestjs/common';
import { CreateTripDto } from './dto/create-trip.dto';
import { JoinTripDto } from './dto/join-trip.dto';
import { ListTripsDto } from './dto/list-trips.dto';
import { TripsService } from './trips.service';
import { ConfirmationService } from './confirmation.service';

@Controller('trips')
export class TripsController {
  constructor(private readonly trips: TripsService, private readonly confirmations: ConfirmationService) {}
  private userId(req: any, headers: any) { return req.user?.id || headers['x-user-id'] || headers['X-User-Id']; }
  @Post() create(@Req() req: any, @Headers() headers: any, @Body() dto: CreateTripDto) { return this.trips.create(this.userId(req, headers), dto, headers['idempotency-key']); }
  @Get() list(@Query() dto: ListTripsDto) { return this.trips.list(dto); }
  @Get(':id') findOne(@Param('id') id: string) { return this.trips.findOne(id); }
  @Post(':id/join') join(@Param('id') id: string, @Req() req: any, @Headers() headers: any, @Body() dto: JoinTripDto) { return this.trips.join(this.userId(req, headers), id, dto, headers['idempotency-key']); }
  @Post(':id/confirmations') confirm(@Param('id') id: string, @Req() req: any, @Headers() headers: any) { return this.confirmations.confirm(id, this.userId(req, headers), headers['idempotency-key']); }
  @Post(':id/confirmations/:confirmationId/withdraw') withdraw(@Param('id') id: string, @Param('confirmationId') confirmationId: string, @Req() req: any, @Headers() headers: any) { return this.confirmations.withdraw(id, confirmationId, this.userId(req, headers)); }
}
