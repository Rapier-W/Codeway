import { Body, Controller, Param, Post } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { CurrentUserId } from '../common/current-user.decorator';
import { IdempotencyKey } from '../common/idempotency-key.decorator';
import { PlatformService } from './platform.service';
import { CreateSosEventDto } from './dto/create-sos-event.dto';
import { CreateEmergencyContactDto } from './dto/create-emergency-contact.dto';
import { OpenTripRideDto } from './dto/open-trip-ride.dto';

@Controller()
export class PlatformController {
  constructor(private readonly service: PlatformService) {}

  @Post('auth/phone')
  verify(@CurrentUserId() userId: string, @Body() body: any) {
    return this.service.verifyPhone(userId, body.phone);
  }

  // 开发联调占位：Task 3 专用，用任意手机号换取一个 userId，无需验证码。
  // service 内已有 NODE_ENV=production 守卫；Task 5 接入真实会话后必须删除。
  @Public()
  @Post('auth/dev-login')
  devLogin(@Body() body: any) {
    return this.service.devLogin(String(body?.phone ?? 'dev-user'));
  }

  @Post('trips/:id/ride/open')
  openRide(@Param('id') id: string, @CurrentUserId() userId: string, @Body() dto: OpenTripRideDto, @IdempotencyKey(false) idempotencyKey?: string) {
    return this.service.openRide(id, userId, dto.platform, idempotencyKey);
  }

  @Post('trips/:id/vehicle')
  vehicle(@Param('id') id: string, @CurrentUserId() userId: string, @Body() body: any, @IdempotencyKey(false) idempotencyKey?: string) {
    return this.service.updateVehicle(id, userId, body, idempotencyKey);
  }

  @Post('trips/:id/sos')
  sos(@Param('id') id: string, @CurrentUserId() userId: string, @Body() dto: CreateSosEventDto, @IdempotencyKey() idempotencyKey: string) {
    return this.service.triggerSos(id, userId, dto, idempotencyKey);
  }

  @Post('emergency-contacts')
  contact(@CurrentUserId() userId: string, @Body() dto: CreateEmergencyContactDto, @IdempotencyKey(false) idempotencyKey?: string) {
    return this.service.addEmergencyContact(userId, dto, idempotencyKey);
  }

  @Post('reports')
  report(@CurrentUserId() userId: string, @Body() body: any) {
    return this.service.createReport(userId, body);
  }

  @Post('analytics/events')
  analytics(@CurrentUserId() userId: string, @Body() body: any) {
    return this.service.recordAnalytics(userId, body);
  }
}
