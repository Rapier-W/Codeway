import { Body, Controller, Headers, HttpCode, Param, Post, Req } from '@nestjs/common';
import { PlatformService } from './platform.service';
@Controller()
export class PlatformController {
  constructor(private readonly service: PlatformService) {}
  // Identity comes exclusively from the global AuthGuard (req.user). The old
  // x-user-id header fallback is removed so it can never bypass auth.
  private uid(req: any, headers: any) { return req.user?.id; }
  @Post('trips/:id/ride/open') openRide(@Param('id') id: string, @Req() req: any, @Headers() h: any, @Body() body: any) { return this.service.openRide(id, this.uid(req, h), body.platform); }
  @Post('trips/:id/vehicle') vehicle(@Param('id') id: string, @Req() req: any, @Headers() h: any, @Body() body: any) { return this.service.updateVehicle(id, this.uid(req, h), body); }
  @Post('trips/:id/sos') sos(@Param('id') id: string, @Req() req: any, @Headers() h: any, @Body() body: any) { return this.service.triggerSos(id, this.uid(req, h), body); }
  @Post('emergency-contacts') contact(@Req() req: any, @Headers() h: any, @Body() body: any) { return this.service.addEmergencyContact(this.uid(req, h), body); }
  @Post('trips/:id/reviews') review(@Param('id') id: string, @Req() req: any, @Headers() h: any, @Body() body: any) { return this.service.createReview(id, this.uid(req, h), body); }
  @Post('reports') report(@Req() req: any, @Headers() h: any, @Body() body: any) { return this.service.createReport(this.uid(req, h), body); }
  @Post('analytics/events') analytics(@Req() req: any, @Headers() h: any, @Body() body: any) { return this.service.recordAnalytics(this.uid(req, h), body); }
}
