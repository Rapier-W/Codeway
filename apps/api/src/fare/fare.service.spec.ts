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
    objectUpload: { findUnique: jest.fn(), create: jest.fn(), updateMany: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  };
  const prisma: any = {
    $transaction: jest.fn((fn: any) => fn(tx)),
    fareOrder: tx.fareOrder,
    tripMember: tx.tripMember,
    objectUpload: tx.objectUpload,
    auditLog: tx.auditLog,
  };
  const storage: any = { createUploadGrant: jest.fn(), statObject: jest.fn(), createPrivateDownloadUrl: jest.fn(), deleteObject: jest.fn() };
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
    tx.objectUpload.updateMany.mockResolvedValue({ count: 1 });
    tx.objectUpload.findMany.mockResolvedValue([]);
    storage.createUploadGrant.mockImplementation(async ({ key, expiresAt }: any) => ({
      objectKey: key,
      uploadUrl: 'https://upload.example.test',
      uploadToken: 'temporary-upload-token',
      expiresAt,
    }));
  });

  it('rejects missing or invalid screenshot upload IDs before persistence', async () => {
    await expect(service.createOrder('t1', 'u1', {
      screenshotUploadId: '', actualTotalFareCents: 1000,
    } as any)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.createOrder('t1', 'u1', {
      screenshotUploadId: 'not-a-uuid', actualTotalFareCents: 1000,
    } as any)).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.fareOrder.create).not.toHaveBeenCalled();
  });

  it('allows only the trip creator to submit an order', async () => {
    await expect(service.createOrder('t1', 'u2', {
      screenshotUploadId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', actualTotalFareCents: 1000,
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

  it('recovers a concurrent identical request key but rejects a mismatched winner', async () => {
    tx.trip.findUnique.mockResolvedValue({ id: 't1', creatorId: 'u1', status: 'RIDE_BOOKED', disputeLocked: false, members: [] });
    tx.objectUpload.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'raced-upload', tripId: 't1', ownerId: 'u1', allowedMimeType: 'image/png', declaredSizeBytes: 100,
      objectKey: 'fare-screenshots/u1/t1/raced.png', maxSizeBytes: 10 * 1024 * 1024,
      expiresAt: new Date(Date.now() + 60_000), claimedAt: null,
    });
    tx.objectUpload.create.mockRejectedValueOnce({ code: 'P2002' });
    await expect(service.createScreenshotUpload('t1', 'u1', { mimeType: 'image/png', sizeBytes: 100 }, 'race-key'))
      .resolves.toMatchObject({ uploadId: 'raced-upload' });
  });

  it('uses provider metadata rather than browser metadata when atomically binding an order', async () => {
    const activeUpload = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', tripId: 't1', ownerId: 'u1',
      objectKey: 'fare-screenshots/u1/t1/active.png', allowedMimeType: 'image/png',
      maxSizeBytes: 10 * 1024 * 1024, expiresAt: new Date(Date.now() + 60_000), claimedAt: null,
    };
    tx.objectUpload.findUnique.mockResolvedValue(activeUpload);
    storage.statObject.mockResolvedValue({ key: activeUpload.objectKey, mimeType: 'image/png', sizeBytes: 512 });
    tx.fareOrder.findUnique.mockResolvedValue(null);
    tx.fareOrder.create.mockImplementation(async ({ data }: any) => ({ id: 'fo1', ...data }));

    await service.createOrder('t1', 'u1', { screenshotUploadId: activeUpload.id, actualTotalFareCents: 1200 } as any);

    expect(tx.objectUpload.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: activeUpload.id, claimedAt: null }),
    }));
    expect(tx.fareOrder.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      screenshotKey: activeUpload.objectKey, screenshotMimeType: 'image/png', screenshotSizeBytes: 512,
    }) }));
  });

  it('does not claim an upload that expires after its initial check but before atomic consumption', async () => {
    const activeUpload = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', tripId: 't1', ownerId: 'u1',
      objectKey: 'fare-screenshots/u1/t1/active.png', allowedMimeType: 'image/png',
      maxSizeBytes: 10 * 1024 * 1024, expiresAt: new Date(Date.now() + 60_000), claimedAt: null,
    };
    tx.objectUpload.findUnique.mockResolvedValue(activeUpload);
    storage.statObject.mockResolvedValue({ key: activeUpload.objectKey, mimeType: 'image/png', sizeBytes: 512 });
    tx.objectUpload.updateMany.mockImplementation(async ({ where }: any) => ({
      // Simulate the database observing expiry after the earlier read but at the claim itself.
      count: where.expiresAt?.gt instanceof Date ? 0 : 1,
    }));

    await expect(service.createOrder('t1', 'u1', {
      screenshotUploadId: activeUpload.id, actualTotalFareCents: 1200,
    } as any)).rejects.toBeInstanceOf(ConflictException);

    expect(storage.statObject).toHaveBeenCalledWith(activeUpload.objectKey);
    expect(tx.objectUpload.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ expiresAt: { gt: expect.any(Date) } }),
    }));
    expect(tx.fareOrder.create).not.toHaveBeenCalled();
  });

  it('rejects expired, claimed, cross-trip, and metadata-mismatched uploads before claiming or writing an order', async () => {
    const activeUpload = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', tripId: 't1', ownerId: 'u1',
      objectKey: 'fare-screenshots/u1/t1/active.png', allowedMimeType: 'image/png',
      maxSizeBytes: 10 * 1024 * 1024, expiresAt: new Date(Date.now() + 60_000), claimedAt: null,
    };
    tx.objectUpload.findUnique.mockResolvedValue(activeUpload);
    storage.statObject.mockResolvedValue({ key: activeUpload.objectKey, mimeType: 'image/webp', sizeBytes: 512 });
    await expect(service.createOrder('t1', 'u1', { screenshotUploadId: activeUpload.id, actualTotalFareCents: 1200 } as any))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(tx.objectUpload.updateMany).not.toHaveBeenCalled();
    expect(tx.fareOrder.create).not.toHaveBeenCalled();
  });

  it('rejects expired, claimed, and cross-trip uploads without writing an order', async () => {
    const baseUpload = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', tripId: 't1', ownerId: 'u1',
      objectKey: 'fare-screenshots/u1/t1/active.png', allowedMimeType: 'image/png',
      maxSizeBytes: 10 * 1024 * 1024, expiresAt: new Date(Date.now() - 1), claimedAt: null,
    };
    tx.objectUpload.findUnique.mockResolvedValue(baseUpload);
    await expect(service.createOrder('t1', 'u1', { screenshotUploadId: baseUpload.id, actualTotalFareCents: 1200 } as any))
      .rejects.toBeInstanceOf(BadRequestException);

    tx.objectUpload.findUnique.mockResolvedValue({ ...baseUpload, expiresAt: new Date(Date.now() + 60_000), claimedAt: new Date() });
    await expect(service.createOrder('t1', 'u1', { screenshotUploadId: baseUpload.id, actualTotalFareCents: 1200 } as any))
      .rejects.toBeInstanceOf(BadRequestException);

    tx.objectUpload.findUnique.mockResolvedValue({ ...baseUpload, expiresAt: new Date(Date.now() + 60_000), tripId: 'other-trip' });
    await expect(service.createOrder('t1', 'u1', { screenshotUploadId: baseUpload.id, actualTotalFareCents: 1200 } as any))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(storage.statObject).not.toHaveBeenCalled();
    expect(tx.objectUpload.updateMany).not.toHaveBeenCalled();
    expect(tx.fareOrder.create).not.toHaveBeenCalled();
  });

  it('issues a precisely 60-second read URL only to trip members', async () => {
    tx.fareOrder.findUnique.mockResolvedValue({ id: 'fo1', tripId: 't1', screenshotKey: 'fare-screenshots/u1/t1/active.png' });
    tx.tripMember.findUnique.mockResolvedValue(null);
    await expect(service.getScreenshotUrl('fo1', 'outsider')).rejects.toBeInstanceOf(ForbiddenException);

    tx.tripMember.findUnique.mockResolvedValue({ id: 'm1', tripId: 't1', userId: 'u2' });
    storage.createPrivateDownloadUrl.mockResolvedValue('memory://fare-screenshots/u1/t1/active.png?expires=60');
    await expect(service.getScreenshotUrl('fo1', 'u2')).resolves.toMatchObject({ url: expect.stringContaining('expires=60') });
    expect(storage.createPrivateDownloadUrl).toHaveBeenLastCalledWith('fare-screenshots/u1/t1/active.png', 60);
  });

  it('deletes only expired unclaimed undeleted uploads and marks them only after successful deletes', async () => {
    const now = new Date('2026-08-26T00:00:00.000Z');
    tx.objectUpload.findMany.mockResolvedValue([{ id: 'expired', objectKey: 'fare-screenshots/u1/t1/expired.png' }]);
    tx.objectUpload.findUnique.mockResolvedValue({
      id: 'expired', tripId: 't1', objectKey: 'fare-screenshots/u1/t1/expired.png',
      purpose: 'FARE_SCREENSHOT', expiresAt: new Date('2026-08-25T23:59:59.000Z'), claimedAt: null, deletedAt: null,
    });
    await expect(service.cleanupExpiredUploads(now)).resolves.toBe(1);
    expect(storage.deleteObject).toHaveBeenCalledWith('fare-screenshots/u1/t1/expired.png');
    expect(tx.objectUpload.updateMany).toHaveBeenLastCalledWith({
      where: { id: 'expired', purpose: 'FARE_SCREENSHOT', claimedAt: null, deletedAt: null }, data: { deletedAt: now },
    });
    expect(tx.objectUpload.findMany).toHaveBeenCalledWith({
      where: { purpose: 'FARE_SCREENSHOT', expiresAt: { lte: now }, claimedAt: null, deletedAt: null },
    });
  });

  it('does not delete a different-purpose upload that enters cleanup after the fare scan', async () => {
    const now = new Date('2026-08-26T00:00:00.000Z');
    tx.objectUpload.findMany.mockResolvedValue([{ id: 'other-upload' }]);
    tx.objectUpload.findUnique.mockResolvedValue({
      id: 'other-upload', tripId: 't1', objectKey: 'profile-images/u1/avatar.png', purpose: 'PROFILE_IMAGE',
      expiresAt: new Date('2026-08-25T23:59:59.000Z'), claimedAt: null, deletedAt: null,
    });

    await expect(service.cleanupExpiredUploads(now)).resolves.toBe(0);

    expect(tx.objectUpload.findMany).toHaveBeenCalledWith({
      where: { purpose: 'FARE_SCREENSHOT', expiresAt: { lte: now }, claimedAt: null, deletedAt: null },
    });
    expect(storage.deleteObject).not.toHaveBeenCalled();
    expect(tx.objectUpload.updateMany).not.toHaveBeenCalled();
  });

  it('does not mark an upload deleted when object deletion fails', async () => {
    const now = new Date('2026-08-26T00:00:00.000Z');
    tx.objectUpload.findMany.mockResolvedValue([{ id: 'expired', objectKey: 'fare-screenshots/u1/t1/expired.png' }]);
    tx.objectUpload.findUnique.mockResolvedValue({
      id: 'expired', tripId: 't1', objectKey: 'fare-screenshots/u1/t1/expired.png',
      purpose: 'FARE_SCREENSHOT', expiresAt: new Date('2026-08-25T23:59:59.000Z'), claimedAt: null, deletedAt: null,
    });
    storage.deleteObject.mockRejectedValue(new Error('storage unavailable'));
    await expect(service.cleanupExpiredUploads(now)).resolves.toBe(0);
    expect(tx.objectUpload.updateMany).not.toHaveBeenCalled();
  });
});
