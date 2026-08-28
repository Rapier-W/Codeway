import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma.service';
import { CreateFareOrderDto } from './dto/create-fare-order.dto';
import { DisputeFareDto } from './dto/dispute-fare.dto';
import { PaymentMarkDto } from './dto/payment-mark.dto';
import { CreateReviewDto } from './dto/create-review.dto';
import { canTransition, TripStatus } from '../trips/trip-status';
import { OBJECT_STORAGE_PROVIDER, ObjectStorageProvider } from '../storage/object-storage.provider';
import { CreateFareScreenshotUploadDto } from './dto/create-fare-screenshot-upload.dto';

const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024;
const CONFIRMATION_WINDOW_MS = 24 * 60 * 60 * 1000;
// 阶段 3：已确认订单截图保留 90 天，有争议则延长保留。
const RETENTION_DAYS = 90;
const MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class FareService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(OBJECT_STORAGE_PROVIDER) private readonly storage: ObjectStorageProvider,
  ) {}
  private async tx<T>(fn: (client: any) => Promise<T>) { return this.prisma.$transaction(fn); }

  private validateImage(dto: CreateFareOrderDto) {
    if (!UUID_V4_PATTERN.test(String(dto?.screenshotUploadId ?? ''))) throw new BadRequestException('SCREENSHOT_UPLOAD_INVALID');
    if (!Number.isInteger(Number(dto.actualTotalFareCents)) || Number(dto.actualTotalFareCents) < 0) throw new BadRequestException('FARE_AMOUNT_INVALID');
  }

  /**
   * 订单详情：只有行程成员可读，避免订单金额和截图元数据外泄。
   * 返回结构与前端 Order 契约对齐（disputed / settlementLocked / costShare）。
   */
  async getOrder(fareOrderId: string, userId: string) {
    const order = await this.prisma.fareOrder.findUnique({ where: { id: fareOrderId } });
    if (!order) throw new NotFoundException('FARE_ORDER_NOT_FOUND');

    const trip = await this.prisma.trip.findUnique({ where: { id: order.tripId }, include: { members: true } });
    if (!trip) throw new NotFoundException('TRIP_NOT_FOUND');

    const member = await this.prisma.tripMember.findFirst({ where: { tripId: order.tripId, userId } });
    if (!member) throw new ForbiddenException('TRIP_MEMBER_REQUIRED');

    const confirmation = await this.prisma.fareOrderConfirmation.findFirst({ where: { fareOrderId, userId } });
    const disputed = order.status === 'DISPUTED' || order.status === 'MANUAL_REVIEW';

    return {
      id: order.id,
      tripId: order.tripId,
      status: order.status,
      disputed,
      // 争议期间结算、已付标记和互评必须同时锁定。
      settlementLocked: disputed || trip.disputeLocked,
      totalAmountCents: order.totalAmountCents,
      screenshotMimeType: order.screenshotMimeType,
      screenshotSizeBytes: order.screenshotSizeBytes,
      screenshotAvailable: true,
      createdAt: order.createdAt.toISOString(),
      confirmedAt: order.confirmedAt ? order.confirmedAt.toISOString() : null,
      costShare: {
        mode: 'EQUAL' as const,
        amountCents: order.totalAmountCents,
        confirmed: Boolean(confirmation),
      },
      members: (trip.members ?? []).map((member: any) => ({ userId: member.userId, role: member.role, memberCount: member.memberCount })),
    };
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

  async createScreenshotUpload(
    tripId: string,
    userId: string,
    dto: CreateFareScreenshotUploadDto,
    idempotencyKey: string,
  ) {
    const mimeType = String(dto?.mimeType ?? '').toLowerCase();
    const sizeBytes = Number(dto?.sizeBytes);
    if (!MIME_TYPES.has(mimeType)) throw new BadRequestException('SCREENSHOT_FORMAT_NOT_ALLOWED');
    if (!Number.isInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > MAX_SCREENSHOT_BYTES) {
      throw new BadRequestException('SCREENSHOT_SIZE_INVALID');
    }

    return this.tx(async client => {
      const trip = await this.lockTrip(client, tripId);
      if (trip.creatorId !== userId) throw new ForbiddenException('ONLY_CREATOR_CAN_UPLOAD_SCREENSHOT');
      if (trip.disputeLocked || trip.status === 'ORDER_DISPUTED') throw new ConflictException('FARE_SETTLEMENT_LOCKED');
      if (![TripStatus.RIDE_BOOKED, TripStatus.PENDING_SETTLEMENT].includes(trip.status)) {
        throw new ConflictException('TRIP_NOT_READY_FOR_SETTLEMENT');
      }

      const existing = await client.objectUpload.findUnique({ where: { requestKey: idempotencyKey } });
      const now = new Date();
      let upload: any;
      if (existing) {
        if (
          existing.tripId !== tripId ||
          existing.ownerId !== userId ||
          existing.allowedMimeType !== mimeType ||
          existing.declaredSizeBytes !== sizeBytes
        ) {
          throw new ConflictException('IDEMPOTENCY_KEY_REUSED');
        }
        if (existing.claimedAt) throw new ConflictException('SCREENSHOT_UPLOAD_ALREADY_CLAIMED');
        if (new Date(existing.expiresAt) <= now) throw new ConflictException('SCREENSHOT_UPLOAD_EXPIRED');
        upload = existing;
      } else {
        const extension = mimeType === 'image/jpeg' ? 'jpg' : mimeType.slice('image/'.length);
        try {
          upload = await client.objectUpload.create({
            data: {
              purpose: 'FARE_SCREENSHOT', provider: 'KODO',
              objectKey: `fare-screenshots/${userId}/${tripId}/${randomUUID()}.${extension}`,
              tripId, ownerId: userId, allowedMimeType: mimeType,
              declaredSizeBytes: sizeBytes, maxSizeBytes: MAX_SCREENSHOT_BYTES,
              requestKey: idempotencyKey, expiresAt: new Date(now.getTime() + 10 * 60 * 1000),
            },
          });
        } catch (error: any) {
          if (error?.code !== 'P2002') throw error;
          const raced = await client.objectUpload.findUnique({ where: { requestKey: idempotencyKey } });
          if (!raced || raced.tripId !== tripId || raced.ownerId !== userId || raced.allowedMimeType !== mimeType || raced.declaredSizeBytes !== sizeBytes) {
            throw new ConflictException('IDEMPOTENCY_KEY_REUSED');
          }
          if (raced.claimedAt) throw new ConflictException('SCREENSHOT_UPLOAD_ALREADY_CLAIMED');
          if (new Date(raced.expiresAt) <= now) throw new ConflictException('SCREENSHOT_UPLOAD_EXPIRED');
          upload = raced;
        }
      }

      const grant = await this.storage.createUploadGrant({
        key: upload.objectKey,
        mimeType: upload.allowedMimeType,
        maxSizeBytes: upload.maxSizeBytes,
        expiresAt: upload.expiresAt,
      });
      await this.audit(client, tripId, userId, 'fare-screenshot-upload-intent', { uploadId: upload.id });
      return {
        uploadId: upload.id,
        objectKey: grant.objectKey,
        uploadUrl: grant.uploadUrl,
        uploadToken: grant.uploadToken,
        expiresAt: grant.expiresAt.toISOString(),
      };
    });
  }

  async createOrder(tripId: string, userId: string, dto: CreateFareOrderDto, idempotencyKey?: string) {
    this.validateImage(dto);
    if (idempotencyKey === '') throw new BadRequestException('IDEMPOTENCY_KEY_REQUIRED');
    return this.tx(async client => {
      const prior = idempotencyKey ? await client.fareOrder.findUnique({ where: { requestKey: idempotencyKey } }) : null;
      if (prior) {
        if (prior.tripId !== tripId || prior.submittedBy !== userId || prior.totalAmountCents !== Number(dto.actualTotalFareCents) || prior.sourceUploadId !== dto.screenshotUploadId) throw new ConflictException('IDEMPOTENCY_KEY_REUSED');
        return { fareOrder: prior, duplicate: true, locked: false };
      }
      const trip = await this.lockTrip(client, tripId);
      if (trip.creatorId !== userId) throw new ForbiddenException('ONLY_CREATOR_CAN_SUBMIT_ORDER');
      if (trip.disputeLocked || trip.status === 'ORDER_DISPUTED') throw new ConflictException('FARE_SETTLEMENT_LOCKED');
      if (![TripStatus.RIDE_BOOKED, TripStatus.PENDING_SETTLEMENT].includes(trip.status as any)) throw new ConflictException('TRIP_NOT_READY_FOR_SETTLEMENT');
      const upload = await client.objectUpload.findUnique({ where: { id: dto.screenshotUploadId } });
      const now = new Date();
      if (!upload || upload.tripId !== tripId || upload.ownerId !== userId || upload.claimedAt || upload.deletedAt) {
        throw new BadRequestException('SCREENSHOT_UPLOAD_INVALID');
      }
      if (new Date(upload.expiresAt) <= now) throw new BadRequestException('SCREENSHOT_UPLOAD_EXPIRED');

      const metadata = await this.storage.statObject(upload.objectKey);
      if (!metadata) throw new BadRequestException('SCREENSHOT_NOT_FOUND');
      if (
        metadata.key !== upload.objectKey ||
        metadata.mimeType !== upload.allowedMimeType ||
        !MIME_TYPES.has(metadata.mimeType) ||
        !Number.isInteger(metadata.sizeBytes) ||
        metadata.sizeBytes < 1 ||
        metadata.sizeBytes > upload.maxSizeBytes ||
        metadata.sizeBytes > MAX_SCREENSHOT_BYTES
      ) {
        throw new BadRequestException('SCREENSHOT_METADATA_MISMATCH');
      }

      const claimTime = new Date();
      const claimed = await client.objectUpload.updateMany({
        where: { id: upload.id, claimedAt: null, deletedAt: null, expiresAt: { gt: claimTime } },
        data: { claimedAt: claimTime },
      });
      if (claimed.count !== 1) throw new ConflictException('SCREENSHOT_UPLOAD_ALREADY_CLAIMED');

      const data = {
        tripId, submittedBy: userId, screenshotKey: metadata.key,
        screenshotMimeType: metadata.mimeType, screenshotSizeBytes: metadata.sizeBytes,
        totalAmountCents: Number(dto.actualTotalFareCents), status: 'PENDING_CONFIRMATION', confirmedAt: null,
      };
      const existing = await client.fareOrder.findUnique({ where: { tripId } });
      let order: any;
      if (existing) {
        throw new ConflictException(existing.status === 'DISPUTED' ? 'FARE_SETTLEMENT_LOCKED' : 'FARE_ORDER_ALREADY_SUBMITTED');
      }
      try {
        order = await client.fareOrder.create({ data: { ...data, requestKey: idempotencyKey ?? null, sourceUploadId: idempotencyKey ? dto.screenshotUploadId : null } });
      } catch (error: any) {
        if (error?.code !== 'P2002') throw error;
        const raced = idempotencyKey ? await client.fareOrder.findUnique({ where: { requestKey: idempotencyKey } }) : null;
        if (!raced || raced.tripId !== tripId || raced.submittedBy !== userId || raced.totalAmountCents !== Number(dto.actualTotalFareCents) || raced.sourceUploadId !== dto.screenshotUploadId) throw new ConflictException('IDEMPOTENCY_KEY_REUSED');
        order = raced;
      }
      if (trip.status === TripStatus.RIDE_BOOKED) {
        if (!canTransition(trip.status, TripStatus.PENDING_SETTLEMENT)) throw new ConflictException('INVALID_TRIP_TRANSITION');
        await client.trip.update({ where: { id: trip.id }, data: { status: TripStatus.PENDING_SETTLEMENT, disputeLocked: false, version: { increment: 1 } } });
      }
      await this.audit(client, tripId, userId, 'fare-order-submit', { fareOrderId: order.id, totalAmountCents: order.totalAmountCents });
      return { fareOrder: order, duplicate: false, locked: false };
    });
  }

  async getScreenshotUrl(fareOrderId: string, userId: string) {
    const order = await this.prisma.fareOrder.findUnique({ where: { id: fareOrderId } });
    if (!order) throw new NotFoundException('FARE_ORDER_NOT_FOUND');
    await this.membership(this.prisma, order.tripId, userId);
    if ((order as any).screenshotDeletedAt) throw new ConflictException('SCREENSHOT_RETENTION_EXPIRED');
    const expiresInSeconds = 60;
    const url = await this.storage.createPrivateDownloadUrl(order.screenshotKey, expiresInSeconds);
    return { url, expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString() };
  }

  async cleanupExpiredUploads(now: Date): Promise<number> {
    const candidates = await this.prisma.objectUpload.findMany({
      where: { purpose: 'FARE_SCREENSHOT', expiresAt: { lte: now }, claimedAt: null, deletedAt: null },
    });
    let cleaned = 0;
    for (const candidate of candidates) {
      const removed = await this.tx(async client => {
        if (client.$queryRaw) await client.$queryRaw`SELECT id FROM object_uploads WHERE id = ${candidate.id} FOR UPDATE`;
        const upload = await client.objectUpload.findUnique({ where: { id: candidate.id } });
        if (!upload || upload.purpose !== 'FARE_SCREENSHOT' || upload.claimedAt || upload.deletedAt || new Date(upload.expiresAt) > now) return false;
        try {
          await this.storage.deleteObject(upload.objectKey);
        } catch {
          await this.audit(client, upload.tripId, '', 'fare-screenshot-upload-cleanup-delete-failed', {
            uploadId: upload.id, objectKey: upload.objectKey, error: 'STORAGE_DELETE_FAILED',
          });
          return false;
        }
        const updated = await client.objectUpload.updateMany({
          where: { id: upload.id, purpose: 'FARE_SCREENSHOT', claimedAt: null, deletedAt: null }, data: { deletedAt: now },
        });
        return updated.count === 1;
      });
      if (removed) cleaned += 1;
    }
    return cleaned;
  }

  async confirmOrder(fareOrderId: string, userId: string) {
    return this.tx(async client => {
      const order = await client.fareOrder.findUnique({ where: { id: fareOrderId } });
      if (!order) throw new NotFoundException('FARE_ORDER_NOT_FOUND');
      const trip = await this.lockTrip(client, order.tripId);
      await this.membership(client, trip.id, userId);
      if (order.status === 'DISPUTED' || order.status === 'MANUAL_REVIEW') throw new ConflictException('FARE_SETTLEMENT_LOCKED');
      if (order.status === 'CONFIRMED') return { fareOrder: order, duplicate: true, locked: false };
      const submittedAt = order.createdAt ?? order.submittedAt;
      if (Date.now() >= new Date(submittedAt).getTime() + CONFIRMATION_WINDOW_MS) {
        await client.fareOrder.update({ where: { id: order.id }, data: { status: 'MANUAL_REVIEW' } });
        await this.audit(client, trip.id, userId, 'fare-confirm-timeout', { fareOrderId: order.id });
        throw new ConflictException('FARE_CONFIRMATION_WINDOW_EXPIRED');
      }
      const existing = await client.fareOrderConfirmation.findUnique({ where: { fareOrderId_userId: { fareOrderId, userId } } });
      if (existing) return { fareOrder: order, confirmation: existing, duplicate: true, locked: false };
      const confirmation = await client.fareOrderConfirmation.create({ data: { fareOrderId, userId } });
      const confirmedCount = await client.fareOrderConfirmation.count({ where: { fareOrderId } });
      if (confirmedCount >= (trip.members ?? []).length) {
        const confirmed = await client.fareOrder.update({ where: { id: fareOrderId }, data: { status: 'CONFIRMED', confirmedAt: new Date(), retentionDeleteAfter: new Date(Date.now() + RETENTION_DAYS * 24 * 60 * 60 * 1000) } });
        // 费用全员确认是结算状态机的唯一推进点：先完成结算，再开放评价窗口。
        if (trip.status === TripStatus.PENDING_SETTLEMENT) {
          if (!canTransition(trip.status, TripStatus.SETTLED) || !canTransition(TripStatus.SETTLED, TripStatus.PENDING_REVIEW)) {
            throw new ConflictException('INVALID_TRIP_TRANSITION');
          }
          await client.trip.update({ where: { id: trip.id }, data: { status: TripStatus.SETTLED, version: { increment: 1 } } });
          await client.trip.update({ where: { id: trip.id }, data: { status: TripStatus.PENDING_REVIEW, version: { increment: 1 } } });
        }
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
      const updated = await client.fareOrder.update({ where: { id: order.id }, data: { status: 'DISPUTED', retentionDeleteAfter: null } });
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

  /**
   * 评价必须由订单反查行程，确保前端 URL 参数无法被误当成 tripId。
   * 争议、未到评价阶段、非成员、自评和跨行程目标均不可写入。
   */
  async createReview(fareOrderId: string, userId: string, dto: CreateReviewDto, idempotencyKey: string) {
    return this.tx(async client => {
      const order = await client.fareOrder.findUnique({ where: { id: fareOrderId } });
      if (!order) throw new NotFoundException('FARE_ORDER_NOT_FOUND');
      const trip = await this.lockTrip(client, order.tripId);
      if (trip.disputeLocked || order.status === 'DISPUTED' || order.status === 'MANUAL_REVIEW') throw new ConflictException('FARE_SETTLEMENT_LOCKED');
      if (![ 'PENDING_REVIEW', 'ARCHIVED' ].includes(trip.status)) throw new ConflictException('TRIP_NOT_REVIEWABLE');
      await this.membership(client, trip.id, userId);
      if (dto.targetUserId === userId) throw new ForbiddenException('REVIEW_SELF_FORBIDDEN');
      await this.membership(client, trip.id, dto.targetUserId);
      const duplicateKey = await client.review.findUnique({ where: { requestKey: idempotencyKey } });
      if (duplicateKey) {
        if (duplicateKey.tripId !== trip.id || duplicateKey.reviewerId !== userId || duplicateKey.targetUserId !== dto.targetUserId) throw new ConflictException('IDEMPOTENCY_KEY_REUSED');
        return { review: duplicateKey, duplicate: true };
      }
      const duplicateReview = await client.review.findUnique({ where: { tripId_reviewerId_targetUserId: { tripId: trip.id, reviewerId: userId, targetUserId: dto.targetUserId } } });
      if (duplicateReview) throw new ConflictException('REVIEW_ALREADY_SUBMITTED');
      const review = await client.review.create({ data: { tripId: trip.id, reviewerId: userId, targetUserId: dto.targetUserId, punctuality: dto.punctuality, safety: dto.safety, politeness: dto.politeness, communication: dto.communication, comment: dto.comment?.trim() || null, anonymous: Boolean(dto.anonymous), requestKey: idempotencyKey } });
      await this.audit(client, trip.id, userId, 'review-create', { reviewId: review.id, fareOrderId });
      return { review, duplicate: false };
    });
  }

  private async audit(client: any, tripId: string, actorId: string, action: string, payload: any) {
    if (client.auditLog?.create) await client.auditLog.create({ data: { tripId, actorId, action, payload } });
  }

  /**
   * 阶段 3：清理已确认且过期的订单截图。
   * 只删除 retentionDeleteAfter 已到期的已确认订单截图，先删对象再标记删除时间。
   * 有开放争议的订单跳过。已删的订单幂等返回 0。
   */
  async cleanupExpiredBoundScreenshots(now: Date): Promise<number> {
    const candidates = await this.prisma.fareOrder.findMany({
      where: {
        retentionDeleteAfter: { lte: now },
        screenshotDeletedAt: null,
        status: { in: ['CONFIRMED', 'MANUAL_REVIEW'] },
      },
    });

    let cleaned = 0;
    for (const order of candidates) {
      const removed = await this.tx(async client => {
        if (client.$queryRaw) await client.$queryRaw`SELECT id FROM "FareOrder" WHERE id = ${order.id} FOR UPDATE`;
        const locked = await client.fareOrder.findUnique({ where: { id: order.id } });
        if (!locked || locked.screenshotDeletedAt) return false;

        // 有开放争议时跳过删除
        const openDispute = await client.fareDispute.findFirst({ where: { fareOrderId: order.id, status: 'OPEN' } });
        if (openDispute) return false;

        if (!locked.retentionDeleteAfter || new Date(locked.retentionDeleteAfter) > now) return false;

        try {
          await this.storage.deleteObject(locked.screenshotKey);
        } catch {
          await this.audit(client, locked.tripId, '', 'fare-screenshot-retention-delete-failed', {
            fareOrderId: locked.id, objectKey: locked.screenshotKey, error: 'STORAGE_DELETE_FAILED',
          });
          return false;
        }

        await client.fareOrder.update({
          where: { id: order.id },
          data: { screenshotDeletedAt: now },
        });
        await this.audit(client, locked.tripId, '', 'fare-screenshot-retention-deleted', {
          fareOrderId: locked.id, deletedAt: now.toISOString(),
        });
        return true;
      });
      if (removed) cleaned += 1;
    }
    return cleaned;
  }

  /**
   * 阶段 3：结案争议并重计截图留存。
   * 从 resolvedAt 起重新计 90 天删除时间。
   */
  async resolveFareDisputeForRetention(fareOrderId: string, actorId: string, resolvedAt: Date) {
    return this.tx(async client => {
      const order = await client.fareOrder.findUnique({ where: { id: fareOrderId } });
      if (!order) throw new NotFoundException('FARE_ORDER_NOT_FOUND');

      const disputes = await client.fareDispute.findMany({ where: { fareOrderId, status: 'OPEN' } });
      for (const d of disputes) {
        await client.fareDispute.update({ where: { id: d.id }, data: { status: 'RESOLVED', resolvedAt } });
      }

      // 从结案时间起重新计 90 天
      const newRetention = new Date(resolvedAt.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000);
      const updated = await client.fareOrder.update({
        where: { id: fareOrderId },
        data: { retentionDeleteAfter: newRetention, status: order.status === 'DISPUTED' ? 'CONFIRMED' : order.status },
      });

      await this.audit(client, order.tripId, actorId, 'fare-dispute-resolved', {
        fareOrderId, resolvedAt: resolvedAt.toISOString(), newRetention: newRetention.toISOString(),
      });

      return { fareOrder: updated, resolvedCount: disputes.length };
    });
  }
}
