import { ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { RideService } from '../ride/ride.service';
import { RIDE_PLATFORMS, RidePlatform } from '../ride/ride-adapter';
import { TripStatus } from '../trips/trip-status';

@Injectable()
export class PlatformService {
  constructor(private readonly prisma: PrismaService, private readonly ride: RideService) {}
  private tx<T>(fn: (tx: any) => Promise<T>) { return this.prisma.$transaction(fn); }
  // 同一行程的写入会在行锁上短暂排队；给状态机事务足够时间取得连接和行锁，避免把可序列化竞争误报为 500。
  private stateTx<T>(fn: (tx: any) => Promise<T>) { return this.prisma.$transaction(fn, { maxWait: 10_000, timeout: 10_000 }); }
  private userId(value: string) { if (!value) throw new ForbiddenException('AUTH_REQUIRED'); return value; }

  verifyPhone(userId: string, phone: string) {
    this.userId(userId);
    const data = { where: { id: userId }, create: { id: userId, phone, phoneVerified: true }, update: { phone, phoneVerified: true } };
    return this.prisma.user?.upsert ? this.prisma.user.upsert(data) : this.tx(async tx => tx.user.upsert(data));
  }
  me(userId: string) { const where = { where: { id: this.userId(userId) } }; return this.prisma.user?.findUnique ? this.prisma.user.findUnique(where) : this.tx(async tx => tx.user.findUnique(where)); }

  // 开发联调占位：Task 3 专用。用手机号生成/复用一个已验证用户并返回其 id，供前端作为 x-user-id。Task 5 必须删除。
  // 运行时守卫：生产环境直接拒绝，避免误部署造成认证绕过。
  devLogin(phone: string) {
    if (process.env.NODE_ENV === 'production') throw new NotFoundException();
    const id = `dev-${phone.replace(/\D/g, '') || 'user'}`;
    const data = { where: { id }, create: { id, phone, phoneVerified: true }, update: {} };
    return this.prisma.user?.upsert ? this.prisma.user.upsert(data) : this.tx(async tx => tx.user.upsert(data));
  }

  async openRide(tripId: string, userId: string, platform: RidePlatform, requestKey = `ride-${tripId}-${userId}`) {
    if (!RIDE_PLATFORMS.includes(platform as RidePlatform)) throw new ConflictException('RIDE_PLATFORM_INVALID');
    try {
      return await this.stateTx(async tx => {
        await this.lockTrip(tx, tripId);
        const trip = await tx.trip.findUnique({ where: { id: tripId } });
        if (!trip) throw new NotFoundException('TRIP_NOT_FOUND');
        if (trip.creatorId !== userId) throw new ForbiddenException('ONLY_CREATOR_CAN_OPEN_RIDE');
        const existing = tx.rideRecord?.findUnique ? await tx.rideRecord.findUnique({ where: { requestKey } }) : null;
        if (existing) {
          if (existing.tripId !== tripId || existing.requestedBy !== userId) throw new ConflictException('IDEMPOTENCY_KEY_REUSED');
          return { ...existing, duplicate: true, launch: this.ride.openRide(this.rideInput(trip, this.recordPlatform(existing.platform))) };
        }
        if (trip.status !== TripStatus.FORMED && trip.status !== TripStatus.WAITING_RIDE) throw new ConflictException('TRIP_NOT_READY_FOR_RIDE');
        const launch = this.ride.openRide(this.rideInput(trip, platform));
        const record = await tx.rideRecord.create({ data: { tripId, requestedBy: userId, platform, requestKey, mode: 'MANUAL_FALLBACK', status: 'WAITING_RIDE' } });
        await tx.trip.update({ where: { id: tripId }, data: { status: 'WAITING_RIDE' } });
        return { ...record, duplicate: false, launch };
      });
    } catch (error: any) {
      if (error?.code === 'P2028' || error?.code === 'P2024') {
        throw new ServiceUnavailableException('RIDE_STATE_BUSY');
      }
      if (error?.code !== 'P2002') throw error;
      const existing = await this.prisma.rideRecord.findUnique({ where: { requestKey }, include: { trip: true } });
      if (!existing) throw error;
      if (existing.tripId !== tripId || existing.requestedBy !== userId) throw new ConflictException('IDEMPOTENCY_KEY_REUSED');
      return { ...existing, duplicate: true, launch: this.ride.openRide(this.rideInput(existing.trip, this.recordPlatform(existing.platform))) };
    }
  }

  private async lockTrip(tx: any, tripId: string) {
    if (tx.$queryRaw) await tx.$queryRaw`SELECT id FROM trips WHERE id = ${tripId} FOR UPDATE`;
  }

  private rideInput(trip: any, platform: RidePlatform) {
    return {
      origin: trip.origin,
      destination: trip.destination,
      departureAt: trip.departTime?.toISOString?.() ?? undefined,
      platform,
    };
  }

  private recordPlatform(platform: string): RidePlatform {
    if (RIDE_PLATFORMS.includes(platform as RidePlatform)) return platform as RidePlatform;
    // 旧记录曾使用大写枚举；仅在读取既有记录时显式兼容，未知值绝不映射为高德。
    if (platform === 'MANUAL') return 'manual';
    if (platform === 'DIDI') return 'didi';
    if (platform === 'GAODE') return 'amap';
    throw new ConflictException('RIDE_RECORD_PLATFORM_INVALID');
  }
  async updateVehicle(tripId: string, userId: string, data: any, requestKey = `vehicle-${tripId}-${userId}`) {
    return this.stateTx(async tx => {
      await this.lockTrip(tx, tripId);
      const trip = await tx.trip.findUnique({ where: { id: tripId } });
      if (!trip) throw new NotFoundException('TRIP_NOT_FOUND');
      if (trip.creatorId !== userId) throw new ForbiddenException('ONLY_CREATOR_CAN_UPDATE_VEHICLE');
      if (!data?.plate?.trim()) throw new ConflictException('PLATE_REQUIRED');
      if (!['FORMED', TripStatus.WAITING_RIDE, TripStatus.RIDE_BOOKED].includes(trip.status)) throw new ConflictException('TRIP_NOT_READY_FOR_VEHICLE');
      const existing = tx.vehicleUpdate?.findUnique ? await tx.vehicleUpdate.findUnique({ where: { requestKey } }) : null;
      if (existing) { if (existing.tripId !== tripId || existing.updatedBy !== userId) throw new ConflictException('IDEMPOTENCY_KEY_REUSED'); return { ...existing, duplicate: true }; }
      const vehicle = await tx.vehicleUpdate.create({ data: { tripId, updatedBy: userId, requestKey, plate: data.plate, model: data.model, color: data.color, platform: data.platform } });
      if (trip.status === TripStatus.FORMED) await tx.trip.update({ where: { id: tripId }, data: { status: TripStatus.WAITING_RIDE } });
      if (trip.status !== TripStatus.RIDE_BOOKED) await tx.trip.update({ where: { id: tripId }, data: { status: TripStatus.RIDE_BOOKED } });
      return vehicle;
    });
  }
  async triggerSos(tripId: string, userId: string, input: { note?: string }, idempotencyKey: string) {
    return this.tx(async tx => {
      const trip = await tx.trip.findUnique({ where: { id: tripId } });
      if (!trip) throw new NotFoundException('TRIP_NOT_FOUND');
      const member = await tx.tripMember.findUnique({ where: { tripId_userId: { tripId, userId } } });
      if (!member) throw new ForbiddenException('TRIP_MEMBER_REQUIRED');
      const previous = await tx.sosEvent.findUnique({ where: { requestKey: idempotencyKey } });
      if (previous) {
        if (previous.tripId !== tripId || previous.userId !== userId) throw new ConflictException('IDEMPOTENCY_KEY_REUSED');
        return { ...previous, duplicate: true };
      }
      // 精确经纬度不落库：MVP 仅保留事件和通知意图。
      const event = await tx.sosEvent.create({ data: { tripId, userId, requestKey: idempotencyKey, status: 'RECORDED', note: input?.note?.trim() || null } });
      const contacts = await tx.emergencyContact.findMany({ where: { userId, active: true } });
      await tx.notificationEvent.create({ data: { type: 'SOS', tripId, userId, payload: { eventId: event.id, contacts: contacts.map((c: any) => c.id) }, status: 'PENDING' } });
      return { ...event, duplicate: false };
    });
  }
  addEmergencyContact(userId: string, data: any, requestKey = `contact-${userId}-${data.phone}`) {
    return this.tx(async tx => {
      const existing = tx.emergencyContact?.findUnique ? await tx.emergencyContact.findUnique({ where: { requestKey } }) : null;
      if (existing) { if (existing.userId !== userId) throw new ConflictException('IDEMPOTENCY_KEY_REUSED'); return { ...existing, duplicate: true }; }
      return tx.emergencyContact.create({ data: { userId, name: data.name, phone: data.phone, requestKey, active: true } });
    });
  }
  createReport(userId: string, data: any) { return this.prisma.report.create({ data: { reporterId: userId, tripId: data.tripId, targetUserId: data.targetUserId, type: data.type, description: data.description, evidenceKey: data.evidenceKey, status: 'OPEN' } }); }
  recordAnalytics(userId: string | undefined, data: any) { return this.prisma.analyticsEvent.create({ data: { userId, eventKey: data.eventKey, eventType: data.eventType, tripId: data.tripId, reasonCodes: data.reasonCodes ?? [], ruleVersion: data.ruleVersion ?? 'mvp-1', payload: data.payload ?? {} } }); }
}
