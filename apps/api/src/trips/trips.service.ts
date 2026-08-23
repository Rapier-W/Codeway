import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateTripDto } from './dto/create-trip.dto';
import { ListTripsDto } from './dto/list-trips.dto';
import { JoinTripDto } from './dto/join-trip.dto';
import { TripStatus } from './trip-status';

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

  async create(userId: string, dto: CreateTripDto) {
    if (!dto.origin?.trim() || !dto.destination?.trim()) throw new BadRequestException('ORIGIN_AND_DESTINATION_REQUIRED');
    if (![3, 4].includes(Number(dto.capacity))) throw new BadRequestException('CAPACITY_MUST_BE_3_OR_4');
    const departTime = new Date(dto.departTime);
    if (Number.isNaN(departTime.getTime()) || departTime <= new Date()) throw new BadRequestException('DEPART_TIME_MUST_BE_FUTURE');
    return this.prisma.$transaction(async tx => {
      await this.requireVerified(userId, tx);
      const trip = await tx.trip.create({ data: { creatorId: userId, origin: dto.origin, destination: dto.destination, departTime, capacity: Number(dto.capacity), feePlan: dto.feePlan as any, femaleOnly: Boolean(dto.femaleOnly), members: { create: { userId, role: 'CREATOR', memberCount: 1 } } }, include: { members: true } });
      return { ...trip, reasonCodes: [] };
    });
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
      if (trip.creator.phoneVerified || trip.creator.studentVerified) reasons.push('VERIFIED');
      if (trip.capacity - occupied > 0) reasons.push('OPEN_SLOT');
      return { ...trip, reasonCodes: reasons.slice(0, 3) };
    });
  }

  async findOne(id: string) {
    const trip = await this.prisma.trip.findUnique({ where: { id }, include: { members: { include: { user: true } }, creator: true } });
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
      if (trip.status !== TripStatus.RECRUITING) throw new ConflictException('TRIP_NOT_RECRUITING');
      if (trip.femaleOnly && String(user.gender).toUpperCase() !== 'FEMALE') throw new ForbiddenException('FEMALE_ONLY_TRIP');
      const existingByKey = idempotencyKey && tx.tripMember.findUnique
        ? await (tx.tripMember.findUnique as any)({ where: { joinRequestKey: idempotencyKey } })
        : null;
      if (existingByKey) return existingByKey;
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

  async createTrip(userId: string, dto: CreateTripDto) { return this.create(userId, dto); }
  async joinTrip(tripId: string, userId: string, dto: JoinTripDto, idempotencyKey?: string) {
    const result: any = await this.join(userId, tripId, dto, idempotencyKey);
    return result?.member ? result : { member: result };
  }
}
