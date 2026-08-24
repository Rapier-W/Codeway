import { Body, Controller, Headers, HttpCode, Param, Post, Get, Req } from '@nestjs/common';
import { PlatformService } from './platform.service';
@Controller()
export class PlatformController {
  constructor(private readonly service: PlatformService) {}
  private uid(req: any, headers: any) { return req.user?.id || headers['x-user-id'] || headers['X-User-Id']; }
  @Post('auth/request-code') @HttpCode(204) requestCode(@Body() body: any) { return this.service.requestDevelopmentCode(body.phone); }
  @Post('auth/verify-code') verifyCode(@Body() body: any) { return this.service.verifyDevelopmentCode(body.phone, body.code); }
  @Post('auth/phone') verify(@Req() req: any, @Headers() h: any, @Body() body: any) { return this.service.verifyPhone(this.uid(req, h), body.phone); }
  @Get('auth/me') me(@Req() req: any, @Headers() h: any) { return this.service.me(this.uid(req, h)); }
  @Post('trips/:id/ride/open') openRide(@Param('id') id: string, @Req() req: any, @Headers() h: any, @Body() body: any) { return this.service.openRide(id, this.uid(req, h), body.platform); }
  @Post('trips/:id/vehicle') vehicle(@Param('id') id: string, @Req() req: any, @Headers() h: any, @Body() body: any) { return this.service.updateVehicle(id, this.uid(req, h), body); }
  @Post('trips/:id/sos') sos(@Param('id') id: string, @Req() req: any, @Headers() h: any, @Body() body: any) { return this.service.triggerSos(id, this.uid(req, h), body); }
  @Post('emergency-contacts') contact(@Req() req: any, @Headers() h: any, @Body() body: any) { return this.service.addEmergencyContact(this.uid(req, h), body); }
  @Post('trips/:id/reviews') review(@Param('id') id: string, @Req() req: any, @Headers() h: any, @Body() body: any) { return this.service.createReview(id, this.uid(req, h), body); }
  @Post('reports') report(@Req() req: any, @Headers() h: any, @Body() body: any) { return this.service.createReport(this.uid(req, h), body); }
  @Post('analytics/events') analytics(@Req() req: any, @Headers() h: any, @Body() body: any) { return this.service.recordAnalytics(this.uid(req, h), body); }
}
