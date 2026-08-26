import { Module } from '@nestjs/common';
import { AmapService, AMAP_FETCH, AMAP_SERVER_KEY } from '../amap/amap.service';
import { RideController } from './ride.controller';
import { RideService } from './ride.service';

@Module({
  controllers: [RideController],
  providers: [
    RideService,
    AmapService,
    { provide: AMAP_FETCH, useValue: globalThis.fetch.bind(globalThis) },
    { provide: AMAP_SERVER_KEY, useFactory: () => process.env.AMAP_SERVER_KEY ?? '' },
  ],
  exports: [RideService],
})
export class RideModule {}
