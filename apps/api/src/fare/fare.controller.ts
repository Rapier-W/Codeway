import { Body, Controller, Headers, Param, Post, Req } from '@nestjs/common';
import { CreateFareOrderDto } from './dto/create-fare-order.dto';
import { DisputeFareDto } from './dto/dispute-fare.dto';
import { PaymentMarkDto } from './dto/payment-mark.dto';
import { FareService } from './fare.service';
@Controller()
export class FareController {
  constructor(private readonly fare: FareService) {}
  private userId(req: any, headers: any) { return req.user?.id || headers['x-user-id'] || headers['X-User-Id']; }
  @Post('trips/:id/fare-order') create(@Param('id') id: string, @Req() req: any, @Headers() headers: any, @Body() dto: CreateFareOrderDto) { return this.fare.createOrder(id, this.userId(req, headers), dto); }
  @Post('fare-orders/:id/confirm') confirm(@Param('id') id: string, @Req() req: any, @Headers() headers: any) { return this.fare.confirmOrder(id, this.userId(req, headers)); }
  @Post('fare-orders/:id/dispute') dispute(@Param('id') id: string, @Req() req: any, @Headers() headers: any, @Body() dto: DisputeFareDto) { return this.fare.disputeOrder(id, this.userId(req, headers), dto); }
  @Post('fare-orders/:id/payment-mark') paymentMark(@Param('id') id: string, @Req() req: any, @Headers() headers: any, @Body() dto: PaymentMarkDto) { return this.fare.paymentMark(id, this.userId(req, headers), dto || {}); }
}
