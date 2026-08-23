import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateFareOrderDto } from './dto/create-fare-order.dto';
import { DisputeFareDto } from './dto/dispute-fare.dto';
import { PaymentMarkDto } from './dto/payment-mark.dto';

const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024;
const CONFIRMATION_WINDOW_MS = 24 * 60 * 60 * 1000;
const MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

@Injectable()
export class FareService {
  constructor(private readonly prisma: PrismaService) {}
  private async tx<T>(fn: (client: any) => Promise<T>) { return this.prisma.$transaction(fn); }

  private validateImage(dto: CreateFareOrderDto) {
    if (!dto?.screenshotKey?.trim()) throw new BadRequestException('SCREENSHOT_REQUIRED');
    if (!MIME_TYPES.has(String(dto.mimeType).toLowerCase())) throw new BadRequestException('SCREENSHOT_FORMAT_NOT_ALLOWED');
    if (!Number.isInteger(Number(dto.sizeBytes)) || Number(dto.sizeBytes) < 0 || Number(dto.sizeBytes) > MAX_SCREENSHOT_BYTES) throw new BadRequestException('SCREENSHOT_SIZE_INVALID');
    if (!Number.isInteger(Number(dto.actualTotalFareCents)) || Number(dto.actualTotalFareCents) < 0) throw new BadRequestException('FARE_AMOUNT_INVALID');
  }

  private async membership(client: any, tripId: string, userId: string) {
    let member: any = null;
    if (client.tripMember?.findUnique) member = await client.tripMember.findUnique({ where: { tripId_userId: { tripId, userId } } });
    else if (client.tripMember?.findFirst) member = await client.tripMember.findFirst({ where: { tripId, userId } });
    else member = { tripId, userId };
    if (!member) throw new ForbiddenException('TRIP_MEMBER_REQUIRED');
    return member;
  }

  private async lockTrip(client: any, tripId: string) {
    if (client.$queryRaw) await client.$queryRaw`SELECT id FROM trips WHERE id = ${tripId} FOR UPDATE`;
    const trip = await client.trip.findUnique({ where: { id: tripId }, include: { members: true } });
    if (!trip) throw new NotFoundException('TRIP_NOT_FOUND');
    return trip;
  }

  async createOrder(tripId: string, userId: string, dto: CreateFareOrderDto) {
    this.validateImage(dto);
    return this.tx(async client => {
      const trip = await this.lockTrip(client, tripId);
      if (trip.creatorId !== userId) throw new ForbiddenException('ONLY_CREATOR_CAN_SUBMIT_ORDER');
      if (trip.disputeLocked || trip.status === 'ORDER_DISPUTED') throw new ConflictException('FARE_SETTLEMENT_LOCKED');
      const data = { tripId, submittedBy: userId, screenshotKey: dto.screenshotKey.trim(), screenshotMimeType: dto.mimeType.toLowerCase(), screenshotSizeBytes: Number(dto.sizeBytes), totalAmountCents: Number(dto.actualTotalFareCents), status: 'PENDING_CONFIRMATION', confirmedAt: null };
      const existing = await client.fareOrder.findUnique({ where: { tripId } });
      let order: any;
      if (existing) {
        if (existing.status === 'DISPUTED') throw new ConflictException('FARE_SETTLEMENT_LOCKED');
        if (client.fareOrderConfirmation?.deleteMany) await client.fareOrderConfirmation.deleteMany({ where: { fareOrderId: existing.id } });
        if (client.paymentMark?.deleteMany) await client.paymentMark.deleteMany({ where: { fareOrderId: existing.id } });
        order = await client.fareOrder.update({ where: { id: existing.id }, data });
      } else order = await client.fareOrder.create({ data });
      await this.audit(client, tripId, userId, 'fare-order-submit', { fareOrderId: order.id, totalAmountCents: order.totalAmountCents });
      return { fareOrder: order, overwritten: Boolean(existing), locked: false };
    });
  }

  async confirmOrder(fareOrderId: string, userId: string) {
    return this.tx(async client => {
      const order = await client.fareOrder.findUnique({ where: { id: fareOrderId } });
      if (!order) throw new NotFoundException('FARE_ORDER_NOT_FOUND');
      const trip = await this.lockTrip(client, order.tripId);
      if (order.status === 'DISPUTED' || order.status === 'MANUAL_REVIEW') throw new ConflictException('FARE_SETTLEMENT_LOCKED');
      if (order.status === 'CONFIRMED') return { fareOrder: order, duplicate: true, locked: false };
      const submittedAt = order.createdAt ?? order.submittedAt;
      if (Date.now() >= new Date(submittedAt).getTime() + CONFIRMATION_WINDOW_MS) {
        await client.fareOrder.update({ where: { id: order.id }, data: { status: 'MANUAL_REVIEW' } });
        await this.audit(client, trip.id, userId, 'fare-confirm-timeout', { fareOrderId: order.id });
        throw new ConflictException('FARE_CONFIRMATION_WINDOW_EXPIRED');
      }
      await this.membership(client, trip.id, userId);
      const existing = await client.fareOrderConfirmation.findUnique({ where: { fareOrderId_userId: { fareOrderId, userId } } });
      if (existing) return { fareOrder: order, confirmation: existing, duplicate: true, locked: false };
      const confirmation = await client.fareOrderConfirmation.create({ data: { fareOrderId, userId } });
      const confirmedCount = await client.fareOrderConfirmation.count({ where: { fareOrderId } });
      if (confirmedCount >= (trip.members ?? []).length) {
        const confirmed = await client.fareOrder.update({ where: { id: fareOrderId }, data: { status: 'CONFIRMED', confirmedAt: new Date() } });
        await this.audit(client, trip.id, userId, 'fare-order-confirmed', { fareOrderId });
        return { fareOrder: confirmed, confirmation, duplicate: false, locked: false };
      }
      return { fareOrder: order, confirmation, duplicate: false, locked: false };
    });
  }

  async disputeOrder(fareOrderId: string, userId: string, dto: DisputeFareDto) {
    const reason = String(dto?.reason ?? '').trim();
    if (!reason) throw new BadRequestException('DISPUTE_REASON_REQUIRED');
    return this.tx(async client => {
      const order = await client.fareOrder.findUnique({ where: { id: fareOrderId } });
      if (!order) throw new NotFoundException('FARE_ORDER_NOT_FOUND');
      const trip = await this.lockTrip(client, order.tripId);
      await this.membership(client, trip.id, userId);
      if (order.status === 'DISPUTED') {
        const prior = await client.fareDispute.findFirst({ where: { fareOrderId, raisedBy: userId, status: 'OPEN' } });
        return { fareOrder: order, dispute: prior, locked: true, duplicate: true };
      }
      if (order.status === 'CONFIRMED' || order.status === 'MANUAL_REVIEW') throw new ConflictException('FARE_SETTLEMENT_LOCKED');
      const submittedAt = order.createdAt ?? order.submittedAt;
      if (Date.now() >= new Date(submittedAt).getTime() + CONFIRMATION_WINDOW_MS) {
        await client.fareOrder.update({ where: { id: order.id }, data: { status: 'MANUAL_REVIEW' } });
        throw new ConflictException('FARE_CONFIRMATION_WINDOW_EXPIRED');
      }
      const dispute = await client.fareDispute.create({ data: { fareOrderId, raisedBy: userId, reason, status: 'OPEN' } });
      const updated = await client.fareOrder.update({ where: { id: order.id }, data: { status: 'DISPUTED' } });
      await client.trip.update({ where: { id: trip.id }, data: { status: 'ORDER_DISPUTED', disputeLocked: true, version: { increment: 1 } } });
      await this.audit(client, trip.id, userId, 'fare-dispute', { fareOrderId, disputeId: dispute.id });
      return { fareOrder: updated, dispute, locked: true, duplicate: false };
    });
  }

  async paymentMark(fareOrderId: string, userId: string, dto: PaymentMarkDto = {}) {
    if (dto.amountCents !== undefined && (!Number.isInteger(Number(dto.amountCents)) || Number(dto.amountCents) < 0)) throw new BadRequestException('PAYMENT_AMOUNT_INVALID');
    return this.tx(async client => {
      const order = await client.fareOrder.findUnique({ where: { id: fareOrderId } });
      if (!order) throw new NotFoundException('FARE_ORDER_NOT_FOUND');
      const trip = await this.lockTrip(client, order.tripId);
      await this.membership(client, trip.id, userId);
      if (order.status !== 'CONFIRMED' || trip.disputeLocked) throw new ConflictException('FARE_SETTLEMENT_LOCKED');
      const amount = dto.amountCents === undefined ? null : Number(dto.amountCents);
      const mark = await client.paymentMark.upsert({ where: { fareOrderId_userId: { fareOrderId, userId } }, create: { fareOrderId, userId, amountCents: amount }, update: { amountCents: amount, status: 'MARKED', markedAt: new Date() } });
      await this.audit(client, trip.id, userId, 'payment-mark', { fareOrderId, paymentMarkId: mark.id });
      return { paymentMark: mark, locked: false, duplicate: false };
    });
  }

  private async audit(client: any, tripId: string, actorId: string, action: string, payload: any) {
    if (client.auditLog?.create) await client.auditLog.create({ data: { tripId, actorId, action, payload } });
  }
}
