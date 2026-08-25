import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class PlatformService {
  constructor(private readonly prisma: PrismaService) {}
  private tx<T>(fn: (tx: any) => Promise<T>) { return this.prisma.$transaction(fn); }
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

  async openRide(tripId: string, userId: string, platform: string) {
    return this.tx(async tx => {
      const trip = await tx.trip.findUnique({ where: { id: tripId } });
      if (!trip) throw new NotFoundException('TRIP_NOT_FOUND');
      if (trip.creatorId !== userId) throw new ForbiddenException('ONLY_CREATOR_CAN_OPEN_RIDE');
      if (trip.status !== 'FORMED' && trip.status !== 'WAITING_RIDE') throw new ConflictException('TRIP_NOT_READY_FOR_RIDE');
      const record = await tx.rideRecord.create({ data: { tripId, requestedBy: userId, platform, mode: 'MANUAL_FALLBACK', status: 'WAITING_RIDE' } });
      await tx.trip.update({ where: { id: tripId }, data: { status: 'WAITING_RIDE' } });
      return { ...record, launch: { supported: false, copyRouteRequired: true } };
    });
  }
  async updateVehicle(tripId: string, userId: string, data: any) {
    return this.tx(async tx => {
      const trip = await tx.trip.findUnique({ where: { id: tripId } });
      if (!trip) throw new NotFoundException('TRIP_NOT_FOUND');
      if (trip.creatorId !== userId) throw new ForbiddenException('ONLY_CREATOR_CAN_UPDATE_VEHICLE');
      if (!data?.plate?.trim()) throw new ConflictException('PLATE_REQUIRED');
      const vehicle = await tx.vehicleUpdate.create({ data: { tripId, updatedBy: userId, plate: data.plate, model: data.model, color: data.color, platform: data.platform } });
      await tx.trip.update({ where: { id: tripId }, data: { status: 'RIDE_BOOKED' } });
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
  addEmergencyContact(userId: string, data: any) { return this.prisma.emergencyContact.create({ data: { userId, name: data.name, phone: data.phone, active: true } }); }
  createReport(userId: string, data: any) { return this.prisma.report.create({ data: { reporterId: userId, tripId: data.tripId, targetUserId: data.targetUserId, type: data.type, description: data.description, evidenceKey: data.evidenceKey, status: 'OPEN' } }); }
  recordAnalytics(userId: string | undefined, data: any) { return this.prisma.analyticsEvent.create({ data: { userId, eventKey: data.eventKey, eventType: data.eventType, tripId: data.tripId, reasonCodes: data.reasonCodes ?? [], ruleVersion: data.ruleVersion ?? 'mvp-1', payload: data.payload ?? {} } }); }
}
