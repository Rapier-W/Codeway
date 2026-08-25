import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateTripDto } from './dto/create-trip.dto';
import { ListTripsDto } from './dto/list-trips.dto';
import { JoinTripDto } from './dto/join-trip.dto';
import { TripStatus } from './trip-status';

const RECOMMENDATION_REASONS = ['TIME_CLOSE', 'RELIABLE', 'VERIFIED', 'OPEN_SLOT'] as const;

@Injectable()
export class TripsService {
  constructor(private readonly prisma: PrismaService) {}

  private async requireVerified(userId: string, client: any = this.prisma) {
    if (!userId) throw new ForbiddenException('AUTH_REQUIRED');
    const finder = client.user?.findUnique;
    const user = finder ? await finder.call(client.user, { where: { id: userId } }) : { id: userId, phoneVerified: true };
    if (!user) throw new NotFoundException('USER_NOT_FOUND');
    if (!user.phoneVerified) throw new ForbiddenException('PHONE_NOT_VERIFIED');
    return user;
  }

  async create(userId: string, dto: CreateTripDto, idempotencyKey?: string) {
    if (!dto.origin?.trim() || !dto.destination?.trim()) throw new BadRequestException('ORIGIN_AND_DESTINATION_REQUIRED');
    if (![3, 4].includes(Number(dto.capacity))) throw new BadRequestException('CAPACITY_MUST_BE_3_OR_4');
    const departTime = new Date(dto.departTime);
    if (Number.isNaN(departTime.getTime()) || departTime <= new Date()) throw new BadRequestException('DEPART_TIME_MUST_BE_FUTURE');
    try {
      return await this.prisma.$transaction(async tx => {
      await this.requireVerified(userId, tx);
      if (idempotencyKey) {
        const existing = await tx.trip.findUnique({ where: { createRequestKey: idempotencyKey }, include: { members: true } });
        if (existing) {
          if (existing.creatorId !== userId) throw new ConflictException('IDEMPOTENCY_KEY_REUSED');
          return { ...existing, reasonCodes: [] };
        }
      }
      const trip = await tx.trip.create({ data: { creatorId: userId, origin: dto.origin, destination: dto.destination, departTime, capacity: Number(dto.capacity), feePlan: dto.feePlan as any, femaleOnly: Boolean(dto.femaleOnly), ...(idempotencyKey ? { createRequestKey: idempotencyKey } : {}), members: { create: { userId, role: 'CREATOR', memberCount: 1 } } }, include: { members: true } });
      return { ...trip, reasonCodes: [] };
      });
    } catch (error: any) {
      // 同一键并发首次请求会在唯一索引处竞争；回读获胜记录而非向客户端返回 500。
      if (idempotencyKey && error?.code === 'P2002') {
        const existing = await this.prisma.trip.findUnique({ where: { createRequestKey: idempotencyKey }, include: { members: true } });
        if (existing) {
          if (existing.creatorId !== userId) throw new ConflictException('IDEMPOTENCY_KEY_REUSED');
          return { ...existing, reasonCodes: [] };
        }
      }
      throw error;
    }
  }

  async list(dto: ListTripsDto) {
    const now = new Date();
    const where: any = { status: TripStatus.RECRUITING, departTime: { gt: now } };
    if (dto.origin) where.origin = { contains: dto.origin, mode: 'insensitive' };
    if (dto.femaleOnly !== undefined && dto.femaleOnly !== '') where.femaleOnly = String(dto.femaleOnly) === 'true';
    if (dto.date) {
      const start = new Date(`${dto.date}T00:00:00`);
      if (Number.isNaN(start.getTime())) throw new BadRequestException('INVALID_DATE');
      const end = new Date(start); end.setDate(end.getDate() + 1);
      where.departTime = { gte: start > now ? start : now, lt: end };
    }
    const trips = await this.prisma.trip.findMany({ where, orderBy: { departTime: 'asc' }, include: { creator: true, members: true } });
    const filtered = dto.time && /^\d{2}:\d{2}$/.test(dto.time)
      ? trips.filter((trip: any) => {
        const [hour, minute] = dto.time!.split(':').map(Number);
        return trip.departTime.getHours() === hour && trip.departTime.getMinutes() === minute;
      })
      : trips;
    return filtered.map((trip: any) => {
      const occupied = trip.members.reduce((n: number, m: any) => n + m.memberCount, 0);
      const reasons: string[] = [];
      if (trip.creator.creditScore < 60) return { ...trip, reasonCodes: [] };
      const hours = (trip.departTime.getTime() - now.getTime()) / 3600000;
      if (hours <= 2) reasons.push('TIME_CLOSE');
      if (trip.creator.creditScore >= 90) reasons.push('RELIABLE');
      if (trip.creator.studentVerified) reasons.push('VERIFIED');
      if (trip.capacity - occupied > 0) reasons.push('OPEN_SLOT');
      return { ...trip, reasonCodes: reasons.filter((reason) => RECOMMENDATION_REASONS.includes(reason as any)).slice(0, 3) };
    });
  }

  async listMine(userId: string, role: 'joined' | 'published' = 'joined') {
    if (!userId) throw new ForbiddenException('AUTH_REQUIRED');
    const where = role === 'published' ? { creatorId: userId } : { creatorId: { not: userId }, members: { some: { userId, role: 'MEMBER' } } };
    const trips = await this.prisma.trip.findMany({
      where,
      orderBy: { departTime: 'asc' },
      include: { members: true, fareOrders: { select: { id: true } } },
    });
    return trips.map((trip: any) => ({
      id: trip.id,
      origin: trip.origin,
      destination: trip.destination,
      departTime: trip.departTime,
      capacity: trip.capacity,
      activeMemberCount: (trip.members ?? []).reduce((total: number, member: any) => total + Number(member.memberCount ?? 0), 0),
      status: trip.status,
      fareOrderId: trip.fareOrders?.[0]?.id ?? null,
      disputeLocked: Boolean(trip.disputeLocked),
      role: trip.creatorId === userId ? 'published' : 'joined',
    }));
  }

  async findOne(id: string) {
    const trip = await this.prisma.trip.findUnique({ where: { id }, include: { members: { include: { user: true } }, creator: true, fareOrders: { select: { id: true } } } });
    if (!trip) throw new NotFoundException('TRIP_NOT_FOUND');
    return trip;
  }

  async join(userId: string, tripId: string, dto: JoinTripDto, idempotencyKey?: string) {
    const user = await this.requireVerified(userId);
    const count = Number(dto.memberCount);
    if (![1, 2].includes(count)) throw new BadRequestException('MEMBER_COUNT_MUST_BE_1_OR_2');
    return this.prisma.$transaction(async tx => {
      if (tx.$queryRaw) await tx.$queryRaw`SELECT id FROM trips WHERE id = ${tripId} FOR UPDATE`;
      const trip = await tx.trip.findUnique({ where: { id: tripId }, include: { members: true } });
      if (!trip) throw new NotFoundException('TRIP_NOT_FOUND');
      const existingByKey = idempotencyKey && tx.tripMember.findUnique
        ? await (tx.tripMember.findUnique as any)({ where: { joinRequestKey: idempotencyKey } })
        : null;
      if (existingByKey) {
        if (existingByKey.tripId !== tripId || existingByKey.userId !== userId) {
          throw new ConflictException('IDEMPOTENCY_KEY_REUSED');
        }
        return existingByKey;
      }
      if (trip.status !== TripStatus.RECRUITING) throw new ConflictException('TRIP_NOT_RECRUITING');
      if (trip.femaleOnly && String(user.gender).toUpperCase() !== 'FEMALE') throw new ForbiddenException('FEMALE_ONLY_TRIP');
      const existing = tx.tripMember.findUnique
        ? await tx.tripMember.findUnique({ where: { tripId_userId: { tripId, userId } } })
        : await tx.tripMember.findFirst({ where: { tripId, userId } });
      if (existing) return existing;
      const members = trip.members ?? (tx.tripMember.findMany ? await tx.tripMember.findMany({ where: { tripId } }) : []);
      const occupied = members.reduce((n: number, m: any) => n + m.memberCount, 0);
      if (occupied + count > trip.capacity) throw new ConflictException('TRIP_CAPACITY_EXCEEDED');
      const member = await tx.tripMember.create({ data: { tripId, userId, role: 'MEMBER', memberCount: count, ...(idempotencyKey ? { joinRequestKey: idempotencyKey } : {}) } as any });
      if (tx.auditLog?.create) await tx.auditLog.create({ data: { tripId, actorId: userId, action: 'join', payload: { idempotencyKey, memberCount: count } } });
      return member;
    });
  }

  async createTrip(userId: string, dto: CreateTripDto, idempotencyKey?: string) { return this.create(userId, dto, idempotencyKey); }
  async joinTrip(tripId: string, userId: string, dto: JoinTripDto, idempotencyKey?: string) {
    const result: any = await this.join(userId, tripId, dto, idempotencyKey);
    return result?.member ? result : { member: result };
  }
}
