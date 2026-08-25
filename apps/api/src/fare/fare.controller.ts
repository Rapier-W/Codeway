import { Body, Controller, Param, Post } from '@nestjs/common';
import { CurrentUserId } from '../common/current-user.decorator';
import { CreateFareOrderDto } from './dto/create-fare-order.dto';
import { DisputeFareDto } from './dto/dispute-fare.dto';
import { PaymentMarkDto } from './dto/payment-mark.dto';
import { FareService } from './fare.service';

@Controller()
export class FareController {
  constructor(private readonly fare: FareService) {}

  @Post('trips/:id/fare-order')
  create(@Param('id') id: string, @CurrentUserId() userId: string, @Body() dto: CreateFareOrderDto) {
    return this.fare.createOrder(id, userId, dto);
  }

  @Post('fare-orders/:id/confirm')
  confirm(@Param('id') id: string, @CurrentUserId() userId: string) {
    return this.fare.confirmOrder(id, userId);
  }

  @Post('fare-orders/:id/dispute')
  dispute(@Param('id') id: string, @CurrentUserId() userId: string, @Body() dto: DisputeFareDto) {
    return this.fare.disputeOrder(id, userId, dto);
  }

  @Post('fare-orders/:id/payment-mark')
  paymentMark(@Param('id') id: string, @CurrentUserId() userId: string, @Body() dto: PaymentMarkDto) {
    return this.fare.paymentMark(id, userId, dto || {});
  }
}
