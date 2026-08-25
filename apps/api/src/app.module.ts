import { Controller, Get, Module } from '@nestjs/common';
import { TripsModule } from './trips/trips.module';
import { PlatformModule } from './platform/platform.module';
import { FareModule } from './fare/fare.module';
import { ChatModule } from './chat/chat.module';

@Controller()
class HealthController {
  @Get('health')
  health() {
    return { status: 'ok' };
  }
}

@Module({
  controllers: [HealthController],
  imports: [TripsModule, PlatformModule, FareModule, ChatModule],
})
export class AppModule {}
