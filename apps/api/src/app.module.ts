import { Controller, Get, Module } from '@nestjs/common';
import { TripsModule } from './trips/trips.module';
import { PlatformModule } from './platform/platform.module';
import { FareModule } from './fare/fare.module';
import { AuthModule } from './auth/auth.module';
import { Public } from './auth/public.decorator';

@Controller()
class HealthController {
  @Public()
  @Get('health')
  health() {
    return { status: 'ok' };
  }
}

@Module({
  controllers: [HealthController],
  imports: [AuthModule, TripsModule, PlatformModule, FareModule],
})
export class AppModule {}
