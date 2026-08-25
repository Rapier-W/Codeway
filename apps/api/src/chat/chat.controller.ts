import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUserId } from '../common/current-user.decorator';
import { IdempotencyKey } from '../common/idempotency-key.decorator';
import { ChatService } from './chat.service';
import { ListMessagesDto } from './dto/list-messages.dto';
import { SendMessageDto } from './dto/send-message.dto';

@Controller('trips/:id/messages')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get()
  list(@Param('id') tripId: string, @CurrentUserId() userId: string, @Query() dto: ListMessagesDto) {
    return this.chat.list(tripId, userId, dto);
  }

  @Post()
  send(
    @Param('id') tripId: string,
    @CurrentUserId() userId: string,
    @Body() dto: SendMessageDto,
    @IdempotencyKey() clientKey: string,
  ) {
    return this.chat.send(tripId, userId, dto, clientKey);
  }
}
