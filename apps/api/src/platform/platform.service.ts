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
  async submitFareOrder(tripId: string, userId: string, data: any) {
    return this.tx(async tx => {
      const trip = await tx.trip.findUnique({ where: { id: tripId } });
      if (!trip || trip.creatorId !== userId) throw new ForbiddenException('ONLY_CREATOR_CAN_SUBMIT_FARE');
      if (!Number.isInteger(data.totalAmountCents) || data.totalAmountCents < 0) throw new ConflictException('INVALID_AMOUNT');
      const order = await tx.fareOrder.create({ data: { tripId, submittedBy: userId, totalAmountCents: data.totalAmountCents, screenshotKey: data.screenshotKey, status: 'PENDING_CONFIRMATION' } });
      await tx.trip.update({ where: { id: tripId }, data: { status: 'PENDING_SETTLEMENT', disputeLocked: false } });
      return order;
    });
  }
  async disputeFare(orderId: string, userId: string, reason: string) {
    return this.tx(async tx => {
      const order = await tx.fareOrder.findUnique({ where: { id: orderId } });
      if (!order) throw new NotFoundException('FARE_ORDER_NOT_FOUND');
      const dispute = await tx.fareDispute.create({ data: { fareOrderId: orderId, raisedBy: userId, reason, status: 'OPEN' } });
      await tx.fareOrder.update({ where: { id: orderId }, data: { status: 'DISPUTED' } });
      await tx.trip.update({ where: { id: order.tripId }, data: { disputeLocked: true, status: 'PENDING_SETTLEMENT' } });
      return dispute;
    });
  }
  async triggerSos(tripId: string, userId: string, location: any) {
    return this.tx(async tx => {
      const event = await tx.sosEvent.create({ data: { tripId, userId, latitude: location?.latitude ?? null, longitude: location?.longitude ?? null, status: 'RECORDED' } });
      const contacts = await tx.emergencyContact.findMany({ where: { userId, active: true } });
      await tx.notificationEvent.create({ data: { type: 'SOS', tripId, userId, payload: { eventId: event.id, contacts: contacts.map((c: any) => c.id) }, status: 'PENDING' } });
      return event;
    });
  }
  addEmergencyContact(userId: string, data: any) { return this.prisma.emergencyContact.create({ data: { userId, name: data.name, phone: data.phone, active: true } }); }
  async createReview(tripId: string, userId: string, data: any) {
    const finder = this.prisma.trip?.findUnique ? this.prisma.trip.findUnique.bind(this.prisma.trip) : async (args: any) => this.tx(async tx => tx.trip.findUnique(args));
    const trip = await finder({ where: { id: tripId }, include: { members: true } });
    if (!trip || trip.status !== 'PENDING_REVIEW' && trip.status !== 'ARCHIVED') throw new ConflictException('TRIP_NOT_REVIEWABLE');
    return this.prisma.review.create({ data: { tripId, reviewerId: userId, targetUserId: data.targetUserId, punctuality: data.punctuality, safety: data.safety, politeness: data.politeness, communication: data.communication, comment: data.comment, anonymous: Boolean(data.anonymous) } });
  }
  createReport(userId: string, data: any) { return this.prisma.report.create({ data: { reporterId: userId, tripId: data.tripId, targetUserId: data.targetUserId, type: data.type, description: data.description, evidenceKey: data.evidenceKey, status: 'OPEN' } }); }
  recordAnalytics(userId: string | undefined, data: any) { return this.prisma.analyticsEvent.create({ data: { userId, eventKey: data.eventKey, eventType: data.eventType, tripId: data.tripId, reasonCodes: data.reasonCodes ?? [], ruleVersion: data.ruleVersion ?? 'mvp-1', payload: data.payload ?? {} } }); }
}
