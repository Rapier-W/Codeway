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
  };
  const prisma: any = { $transaction: jest.fn((fn: any) => fn(tx)) };
  let service: FareService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FareService(prisma);
    tx.trip.findUnique.mockResolvedValue({
      id: 't1', creatorId: 'u1', status: 'PENDING_SETTLEMENT',
      members: [{ userId: 'u1' }, { userId: 'u2' }],
    });
    tx.tripMember.findUnique.mockResolvedValue({ id: 'm1', tripId: 't1', userId: 'u2' });
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
});
