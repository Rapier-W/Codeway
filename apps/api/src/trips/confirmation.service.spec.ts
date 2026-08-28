import { ConflictException, NotFoundException } from '@nestjs/common';
import { ConfirmationService } from './confirmation.service';

describe('ConfirmationService', () => {
  const tx: any = {
    $queryRaw: jest.fn(),
    trip: { findUnique: jest.fn(), update: jest.fn() },
    tripMember: { findUnique: jest.fn() },
    tripConfirmation: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
    farePlanRevision: { findFirst: jest.fn(), create: jest.fn() },
    farePlanConfirmation: { createMany: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const prisma: any = { $transaction: jest.fn((fn: any) => fn(tx)) };
  let service: ConfirmationService;

  beforeEach(() => { jest.clearAllMocks(); service = new ConfirmationService(prisma); });

  it('keeps a partial confirmation in CONFIRMING', async () => {
    tx.trip.findUnique.mockResolvedValue({ id: 't1', status: 'RECRUITING', version: 0, members: [{ id: 'm1' }, { id: 'm2' }] });
    tx.tripMember.findUnique.mockResolvedValue({ id: 'm1', tripId: 't1', userId: 'u1' });
    tx.tripConfirmation.findUnique.mockResolvedValue(null);
    tx.tripConfirmation.findMany.mockResolvedValue([]);
    tx.tripConfirmation.create.mockResolvedValue({ id: 'c1', status: 'CONFIRMED' });
    tx.trip.update.mockResolvedValue({ id: 't1', status: 'CONFIRMING' });
    const result = await service.confirm('t1', 'u1', 'key-1');
    expect(result.tripStatus).toBe('CONFIRMING');
    expect(tx.trip.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'CONFIRMING' }) }));
  });

  it('forms the trip and opens a 15 second withdrawal window when all members confirm', async () => {
    tx.trip.findUnique.mockResolvedValue({ id: 't1', status: 'CONFIRMING', version: 1, initialFarePlan: { mode: 'EQUAL' }, members: [{ id: 'm1', userId: 'u1' }, { id: 'm2', userId: 'u2' }] });
    tx.tripMember.findUnique.mockResolvedValue({ id: 'm2', tripId: 't1', userId: 'u2' });
    tx.tripConfirmation.findUnique.mockResolvedValue(null);
    tx.tripConfirmation.findMany.mockResolvedValue([{ id: 'c1', memberId: 'm1', status: 'CONFIRMED' }]);
    tx.tripConfirmation.create.mockResolvedValue({ id: 'c2', memberId: 'm2', status: 'CONFIRMED' });
    tx.tripConfirmation.updateMany.mockResolvedValue({ count: 2 });
    tx.trip.update.mockResolvedValue({ id: 't1', status: 'FORMED' });
    tx.farePlanRevision.findFirst.mockResolvedValue(null);
    tx.farePlanRevision.create.mockResolvedValue({ id: 'r1' });
    const result = await service.confirm('t1', 'u2', 'key-2');
    expect(result.tripStatus).toBe('FORMED');
    expect(result.retractUntil.getTime()).toBeGreaterThan(Date.now());
    expect(tx.tripConfirmation.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'CONFIRMED', retractUntil: expect.any(Date) }) }));
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'form-group' }) }));
    expect(tx.farePlanRevision.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ tripId: 't1', sequence: 1, status: 'PENDING_CONFIRMATION' }) }));
    expect(tx.farePlanConfirmation.createMany).toHaveBeenCalledWith({ data: expect.arrayContaining([expect.objectContaining({ revisionId: 'r1', userId: 'u1', status: 'PENDING' })]) });
  });

  it('returns the same confirmation for a duplicate idempotency key', async () => {
    const existing = { id: 'c1', status: 'CONFIRMED', tripId: 't1', userId: 'u1' };
    tx.trip.findUnique.mockResolvedValue({ id: 't1', status: 'CONFIRMING', version: 0, members: [{ id: 'm1' }] });
    tx.tripMember.findUnique.mockResolvedValue({ id: 'm1', tripId: 't1', userId: 'u1' });
    tx.tripConfirmation.findUnique.mockResolvedValue(existing);
    await expect(service.confirm('t1', 'u1', 'key-1')).resolves.toEqual(expect.objectContaining({ confirmation: existing, duplicate: true }));
    expect(tx.trip.update).not.toHaveBeenCalled();
  });

  it('rejects an idempotency key reused by another trip or user', async () => {
    tx.trip.findUnique.mockResolvedValue({ id: 't1', status: 'CONFIRMING', version: 0, members: [{ id: 'm1' }] });
    tx.tripMember.findUnique.mockResolvedValue({ id: 'm1', tripId: 't1', userId: 'u1' });
    tx.tripConfirmation.findUnique.mockResolvedValue({ id: 'c2', tripId: 't2', userId: 'u2', status: 'CONFIRMED' });
    await expect(service.confirm('t1', 'u1', 'reused')).rejects.toBeInstanceOf(ConflictException);
  });

  it('withdraws within the window and atomically rolls the trip back to RECRUITING', async () => {
    const deadline = new Date(Date.now() + 10000);
    tx.trip.findUnique.mockResolvedValue({ id: 't1', status: 'FORMED', version: 2 });
    tx.tripConfirmation.findUnique.mockResolvedValue({ id: 'c1', tripId: 't1', userId: 'u1', status: 'CONFIRMED', retractUntil: deadline });
    tx.tripConfirmation.updateMany.mockResolvedValue({ count: 2 });
    tx.trip.update.mockResolvedValue({ id: 't1', status: 'RECRUITING' });
    const result = await service.withdraw('t1', 'c1', 'u1');
    expect(result.tripStatus).toBe('RECRUITING');
    expect(tx.tripConfirmation.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'VOID' }) }));
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'rollback' }) }));
  });

  it('rejects withdrawal after the 15 second window', async () => {
    tx.trip.findUnique.mockResolvedValue({ id: 't1', status: 'FORMED', version: 2 });
    tx.tripConfirmation.findUnique.mockResolvedValue({ id: 'c1', tripId: 't1', userId: 'u1', status: 'CONFIRMED', retractUntil: new Date(Date.now() - 1) });
    await expect(service.withdraw('t1', 'c1', 'u1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects confirmation for a missing member', async () => {
    tx.tripConfirmation.findUnique.mockResolvedValue(null);
    tx.trip.findUnique.mockResolvedValue({ id: 't1', status: 'RECRUITING', version: 0, members: [] });
    tx.tripMember.findUnique.mockResolvedValue(null);
    await expect(service.confirm('t1', 'u1', 'key')).rejects.toBeInstanceOf(NotFoundException);
  });
});
