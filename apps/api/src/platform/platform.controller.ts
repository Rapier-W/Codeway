import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUserId } from '../common/current-user.decorator';
import { IdempotencyKey } from '../common/idempotency-key.decorator';
import { Public } from '../auth/public.decorator';
import { PlatformService } from './platform.service';
import { CreateSosEventDto } from './dto/create-sos-event.dto';
import { CreateEmergencyContactDto } from './dto/create-emergency-contact.dto';

@Controller()
export class PlatformController {
  constructor(private readonly service: PlatformService) {}

  @Post('auth/phone')
  verify(@CurrentUserId() userId: string, @Body() body: any) {
    return this.service.verifyPhone(userId, body.phone);
  }

  // 开发联调占位：Task 3 专用，用任意手机号换取一个 userId，无需验证码。
  // service 内已有 NODE_ENV=production 守卫；Task 5 接入真实会话后必须删除。
  // 标记为 @Public：否则会被全局 AuthGuard 拦截（dev-login 不携带任何身份）。
  @Public()
  @Post('auth/dev-login')
  devLogin(@Body() body: any) {
    return this.service.devLogin(String(body?.phone ?? 'dev-user'));
  }

  @Get('auth/me')
  me(@CurrentUserId() userId: string) {
    return this.service.me(userId);
  }

  @Post('trips/:id/ride/open')
  openRide(@Param('id') id: string, @CurrentUserId() userId: string, @Body() body: any) {
    return this.service.openRide(id, userId, body.platform);
  }

  @Post('trips/:id/vehicle')
  vehicle(@Param('id') id: string, @CurrentUserId() userId: string, @Body() body: any) {
    return this.service.updateVehicle(id, userId, body);
  }

  @Post('trips/:id/sos')
  sos(@Param('id') id: string, @CurrentUserId() userId: string, @Body() dto: CreateSosEventDto, @IdempotencyKey() idempotencyKey: string) {
    return this.service.triggerSos(id, userId, dto, idempotencyKey);
  }

  @Post('emergency-contacts')
  contact(@CurrentUserId() userId: string, @Body() dto: CreateEmergencyContactDto) {
    return this.service.addEmergencyContact(userId, dto);
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
