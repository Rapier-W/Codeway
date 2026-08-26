import { Module } from '@nestjs/common';
import { AmapService } from '../amap/amap.service';
import { RideController } from './ride.controller';
import { RideService } from './ride.service';

@Module({
  controllers: [RideController],
  providers: [RideService, AmapService],
  exports: [RideService, AmapService],
})
export class RideModule {}
