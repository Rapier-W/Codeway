import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUserId } from '../common/current-user.decorator';
import { CreateFareOrderDto } from './dto/create-fare-order.dto';
import { DisputeFareDto } from './dto/dispute-fare.dto';
import { PaymentMarkDto } from './dto/payment-mark.dto';
import { CreateReviewDto } from './dto/create-review.dto';
import { CreateFareScreenshotUploadDto } from './dto/create-fare-screenshot-upload.dto';
import { IdempotencyKey } from '../common/idempotency-key.decorator';
import { FareService } from './fare.service';

@Controller()
export class FareController {
  constructor(private readonly fare: FareService) {}

  @Post('trips/:id/fare-order')
  create(@Param('id') id: string, @CurrentUserId() userId: string, @Body() dto: CreateFareOrderDto, @IdempotencyKey() idempotencyKey: string) {
    return this.fare.createOrder(id, userId, dto, idempotencyKey);
  }

  @Post('trips/:id/fare-screenshot-uploads')
  createScreenshotUpload(
    @Param('id') id: string,
    @CurrentUserId() userId: string,
    @Body() dto: CreateFareScreenshotUploadDto,
    @IdempotencyKey() idempotencyKey: string,
  ) {
    return this.fare.createScreenshotUpload(id, userId, dto, idempotencyKey);
  }

  // 订单详情：仅行程成员可访问。同时暴露 /orders/:id 以兼容前端既有契约路径。
  @Get(['fare-orders/:id', 'orders/:id'])
  getOrder(@Param('id') id: string, @CurrentUserId() userId: string) {
    return this.fare.getOrder(id, userId);
  }

  @Get('fare-orders/:id/screenshot')
  getScreenshot(@Param('id') id: string, @CurrentUserId() userId: string) {
    return this.fare.getScreenshotUrl(id, userId);
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

  /** 评价以订单 ID 为边界，服务端反查所属行程，杜绝把 tripId/orderId 混用。 */
  @Post('fare-orders/:id/review')
  review(@Param('id') id: string, @CurrentUserId() userId: string, @Body() dto: CreateReviewDto, @IdempotencyKey() idempotencyKey: string) {
    return this.fare.createReview(id, userId, dto, idempotencyKey);
  }
}
