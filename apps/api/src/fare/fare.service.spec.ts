import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { FareService } from './fare.service';

describe('FareService', () => {
  const tx: any = {
    trip: { findUnique: jest.fn(), update: jest.fn() },
    fareOrder: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    fareOrderConfirmation: { findUnique: jest.fn(), create: jest.fn(), count: jest.fn() },
    tripMember: { findUnique: jest.fn() },
    fareDispute: { create: jest.fn(), findFirst: jest.fn() },
    paymentMark: { upsert: jest.fn() },
    review: { findUnique: jest.fn(), create: jest.fn() },
    auditLog: { create: jest.fn() },
    objectUpload: { findUnique: jest.fn(), create: jest.fn() },
  };
  const prisma: any = { $transaction: jest.fn((fn: any) => fn(tx)) };
  const storage: any = { createUploadGrant: jest.fn() };
  let service: FareService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FareService(prisma, storage);
    tx.trip.findUnique.mockResolvedValue({
      id: 't1', creatorId: 'u1', status: 'PENDING_SETTLEMENT',
      members: [{ userId: 'u1' }, { userId: 'u2' }],
    });
    tx.tripMember.findUnique.mockResolvedValue({ id: 'm1', tripId: 't1', userId: 'u2' });
    tx.objectUpload.findUnique.mockResolvedValue(null);
    tx.objectUpload.create.mockImplementation(async ({ data }: any) => ({ id: 'upload-1', ...data }));
    storage.createUploadGrant.mockImplementation(async ({ key, expiresAt }: any) => ({
      objectKey: key,
      uploadUrl: 'https://upload.example.test',
      uploadToken: 'temporary-upload-token',
      expiresAt,
    }));
  });

  it('rejects unsupported screenshots and oversized files before persistence', async () => {
    await expect(service.createOrder('t1', 'u1', {
      screenshotKey: 'k', mimeType: 'image/gif', sizeBytes: 10, actualTotalFareCents: 1000,
    } as any)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.createOrder('t1', 'u1', {
      screenshotKey: 'k', mimeType: 'image/png', sizeBytes: 10 * 1024 * 1024 + 1, actualTotalFareCents: 1000,
    } as any)).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.fareOrder.create).not.toHaveBeenCalled();
  });

  it('allows only the trip creator to submit an order', async () => {
    await expect(service.createOrder('t1', 'u2', {
      screenshotKey: 'k', mimeType: 'image/png', sizeBytes: 10, actualTotalFareCents: 1000,
    } as any)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('locks the trip and fare order when a member disputes', async () => {
    const order = { id: 'fo1', tripId: 't1', status: 'PENDING_CONFIRMATION', submittedAt: new Date() };
    tx.fareOrder.findUnique.mockResolvedValue(order);
    tx.fareDispute.create.mockResolvedValue({ id: 'd1', fareOrderId: 'fo1', userId: 'u2', status: 'OPEN' });
    tx.fareOrder.update.mockResolvedValue({ ...order, status: 'DISPUTED' });
    tx.trip.update.mockResolvedValue({ id: 't1', status: 'ORDER_DISPUTED' });
    const result = await service.disputeOrder('fo1', 'u2', { reason: '金额不符' } as any);
    expect(result.locked).toBe(true);
    expect(tx.fareOrder.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'DISPUTED' }) }));
    expect(tx.trip.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'ORDER_DISPUTED' }) }));
  });

  it('does not treat a confirmation after 24 hours as consent', async () => {
    tx.fareOrder.findUnique.mockResolvedValue({ id: 'fo1', tripId: 't1', status: 'PENDING_CONFIRMATION', submittedAt: new Date(Date.now() - 25 * 3600 * 1000) });
    tx.fareOrder.update.mockResolvedValue({ id: 'fo1', status: 'MANUAL_REVIEW' });
    await expect(service.confirmOrder('fo1', 'u2')).rejects.toBeInstanceOf(ConflictException);
    expect(tx.fareOrder.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'MANUAL_REVIEW' } }));
    expect(tx.fareOrderConfirmation.create).not.toHaveBeenCalled();
  });

  it('moves the trip into the review window after all members confirm the order', async () => {
    tx.fareOrder.findUnique.mockResolvedValue({ id: 'fo1', tripId: 't1', status: 'PENDING_CONFIRMATION', createdAt: new Date() });
    tx.trip.findUnique.mockResolvedValue({ id: 't1', status: 'PENDING_SETTLEMENT', disputeLocked: false, members: [{ userId: 'u1' }, { userId: 'u2' }] });
    tx.tripMember.findUnique.mockResolvedValue({ id: 'm1', tripId: 't1', userId: 'u2' });
    tx.fareOrderConfirmation.findUnique.mockResolvedValue(null);
    tx.fareOrderConfirmation.create.mockResolvedValue({ id: 'fc1', fareOrderId: 'fo1', userId: 'u2' });
    tx.fareOrderConfirmation.count.mockResolvedValue(2);
    tx.fareOrder.update.mockResolvedValue({ id: 'fo1', status: 'CONFIRMED' });
    await service.confirmOrder('fo1', 'u2');
    expect(tx.trip.update).toHaveBeenNthCalledWith(1, expect.objectContaining({ data: expect.objectContaining({ status: 'SETTLED' }) }));
    expect(tx.trip.update).toHaveBeenNthCalledWith(2, expect.objectContaining({ data: expect.objectContaining({ status: 'PENDING_REVIEW' }) }));
  });

  it('rejects self-review and does not persist it', async () => {
    tx.fareOrder.findUnique.mockResolvedValue({ id: 'fo1', tripId: 't1', status: 'CONFIRMED' });
    tx.trip.findUnique.mockResolvedValue({ id: 't1', status: 'PENDING_REVIEW', disputeLocked: false, members: [{ userId: 'u1' }] });
    tx.tripMember.findUnique.mockResolvedValue({ id: 'm1', tripId: 't1', userId: 'u1' });
    await expect(service.createReview('fo1', 'u1', { targetUserId: 'u1', punctuality: 5, safety: 5, politeness: 5, communication: 5 } as any, 'review-key')).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.review.create).not.toHaveBeenCalled();
  });

  it('allows only the creator of a ride-booked trip to obtain a PNG upload intent', async () => {
    tx.trip.findUnique.mockResolvedValue({
      id: 't1', creatorId: 'u1', status: 'RIDE_BOOKED', disputeLocked: false, members: [],
    });

    const result = await service.createScreenshotUpload('t1', 'u1', { mimeType: 'image/png', sizeBytes: 100 }, 'intent-1');

    expect(result.uploadId).toBe('upload-1');
    expect(result.objectKey).toMatch(/^fare-screenshots\/u1\/t1\/[0-9a-f-]+\.png$/);
    expect(storage.createUploadGrant).toHaveBeenCalledWith(expect.objectContaining({
      mimeType: 'image/png', maxSizeBytes: 10 * 1024 * 1024,
    }));
    expect(JSON.stringify(result)).not.toMatch(/accessKey|secret/i);
  });

  it('rejects non-creators, unsupported uploads, locked trips and idempotency reuse with different input', async () => {
    await expect(service.createScreenshotUpload('t1', 'u2', { mimeType: 'image/png', sizeBytes: 100 }, 'intent-2'))
      .rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.createScreenshotUpload('t1', 'u1', { mimeType: 'image/gif', sizeBytes: 100 }, 'intent-3'))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(service.createScreenshotUpload('t1', 'u1', { mimeType: 'image/png', sizeBytes: 11 * 1024 * 1024 }, 'intent-4'))
      .rejects.toBeInstanceOf(BadRequestException);

    tx.trip.findUnique.mockResolvedValue({ id: 't1', creatorId: 'u1', status: 'RIDE_BOOKED', disputeLocked: true, members: [] });
    await expect(service.createScreenshotUpload('t1', 'u1', { mimeType: 'image/png', sizeBytes: 100 }, 'intent-5'))
      .rejects.toBeInstanceOf(ConflictException);

    tx.trip.findUnique.mockResolvedValue({ id: 't1', creatorId: 'u1', status: 'RIDE_BOOKED', disputeLocked: false, members: [] });
    tx.objectUpload.findUnique.mockResolvedValue({
      id: 'existing-upload', tripId: 't1', ownerId: 'u1', allowedMimeType: 'image/jpeg',
      objectKey: 'fare-screenshots/u1/t1/existing.jpg', maxSizeBytes: 10 * 1024 * 1024,
      declaredSizeBytes: 100,
      expiresAt: new Date(Date.now() + 60_000), claimedAt: null,
    });
    await expect(service.createScreenshotUpload('t1', 'u1', { mimeType: 'image/png', sizeBytes: 100 }, 'intent-6'))
      .rejects.toBeInstanceOf(ConflictException);

    tx.objectUpload.findUnique.mockResolvedValue({
      id: 'existing-upload', tripId: 't1', ownerId: 'u1', allowedMimeType: 'image/png',
      objectKey: 'fare-screenshots/u1/t1/existing.png', maxSizeBytes: 100,
      declaredSizeBytes: 100,
      expiresAt: new Date(Date.now() + 60_000), claimedAt: null,
    });
    await expect(service.createScreenshotUpload('t1', 'u1', { mimeType: 'image/png', sizeBytes: 200 }, 'intent-7'))
      .rejects.toBeInstanceOf(ConflictException);
  });
});
