import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { OpenRideDto } from './dto/open-ride.dto';
import { RideMapQueryDto } from './dto/ride-map-query.dto';
import { RideService } from './ride.service';

@Throttle({ default: { limit: 10, ttl: 60_000 } })
@Controller('ride')
export class RideController {
  constructor(private readonly ride: RideService) {}

  @Get('places')
  places(@Query() dto: RideMapQueryDto) {
    return this.ride.places(dto);
  }

  @Get('geocode')
  geocode(@Query() dto: RideMapQueryDto) {
    return this.ride.geocode(dto);
  }

  @Get('route')
  route(@Query() dto: RideMapQueryDto) {
    return this.ride.route(dto);
  }

  @Post('open')
  open(@Body() dto: OpenRideDto) {
    return this.ride.openRide(dto);
  }
}
