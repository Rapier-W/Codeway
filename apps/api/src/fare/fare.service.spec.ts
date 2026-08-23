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
});
