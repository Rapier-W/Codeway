import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { TripStatus } from '../trips/trip-status';
import { ListMessagesDto } from './dto/list-messages.dto';
import { SendMessageDto } from './dto/send-message.dto';

const DEFAULT_PAGE_SIZE = 30;

/** 行程归档后不再允许发送消息；历史消息仍可读取。 */
const SEND_BLOCKED_STATUSES: readonly string[] = [TripStatus.ARCHIVED];

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 读取行程聊天历史，按时间倒序游标分页。
   * 只有行程成员可读，非成员一律拒绝，避免聊天内容外泄。
   */
  async list(tripId: string, userId: string, dto: ListMessagesDto) {
    await this.assertMember(tripId, userId);

    const take = dto.limit ?? DEFAULT_PAGE_SIZE;
    const messages = await this.prisma.chatMessage.findMany({
      where: {
        tripId,
        ...(dto.before ? { createdAt: { lt: new Date(dto.before) } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: take + 1, // 多取一条用于判断是否还有更多
    });

    const hasMore = messages.length > take;
    const page = hasMore ? messages.slice(0, take) : messages;

    return {
      // 返回给前端时转成时间正序，符合聊天从上到下的阅读顺序。
      messages: page.reverse().map((m) => this.toDto(m)),
      hasMore,
      nextCursor: hasMore ? page[0]?.createdAt.toISOString() : null,
    };
  }

  /**
   * 发送文本消息。
   * 幂等：同一行程内相同 clientKey 重复发送返回首次结果，不产生重复消息。
   */
  async send(tripId: string, userId: string, dto: SendMessageDto, clientKey: string) {
    const { trip } = await this.assertMember(tripId, userId);
    const text = String(dto.text ?? '').trim();
    if (!text) throw new BadRequestException('MESSAGE_TEXT_REQUIRED');

    if (SEND_BLOCKED_STATUSES.includes(trip.status)) throw new ConflictException('TRIP_CHAT_CLOSED');

    const existing = await this.prisma.chatMessage.findFirst({ where: { tripId, clientKey } });
    if (existing) {
      // 幂等键跨用户复用视为冲突，避免顶替他人消息。
      if (existing.senderId !== userId) throw new ConflictException('IDEMPOTENCY_KEY_CONFLICT');
      return { ...this.toDto(existing), duplicate: true };
    }

    let created: any;
    try {
      created = await this.prisma.chatMessage.create({
        data: { tripId, senderId: userId, kind: 'TEXT', text, clientKey },
      });
    } catch (error: any) {
      // 两个并发请求都在首次查询后写入时，数据库的唯一索引是最终裁决。
      // 将 P2002 转回首次消息，避免把可恢复的重试变成 500。
      if (error?.code !== 'P2002') throw error;
      const winner = await this.prisma.chatMessage.findFirst({ where: { tripId, clientKey } });
      if (!winner) throw error;
      if (winner.senderId !== userId) throw new ConflictException('IDEMPOTENCY_KEY_CONFLICT');
      return { ...this.toDto(winner), duplicate: true };
    }

    return { ...this.toDto(created), duplicate: false };
  }

  /** 校验行程存在且当前用户是成员，返回行程供状态判断复用。 */
  private async assertMember(tripId: string, userId: string) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) throw new NotFoundException('TRIP_NOT_FOUND');

    const member = await this.prisma.tripMember.findFirst({ where: { tripId, userId } });
    if (!member) throw new ForbiddenException('TRIP_MEMBER_REQUIRED');

    return { trip, member };
  }

  private toDto(message: { id: string; senderId: string; text: string; kind: string; createdAt: Date }) {
    return {
      id: message.id,
      senderId: message.senderId,
      text: message.text,
      kind: message.kind,
      createdAt: message.createdAt.toISOString(),
    };
  }
}
