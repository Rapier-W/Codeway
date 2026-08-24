import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { TripsService } from './trips.service';

describe('TripsService', () => {
  const tx = {
    user: { findUnique: jest.fn() },
    trip: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    tripMember: { create: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const prisma = { user: tx.user, trip: { findMany: jest.fn() }, $transaction: jest.fn((callback: any) => callback(tx)) };
  let service: TripsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TripsService(prisma as any);
  });

  it('rejects an unverified creator', async () => {
    tx.user.findUnique.mockResolvedValue({ id: 'u1', phoneVerified: false });
    await expect(service.create('u1', {
      origin: 'A', destination: 'B', departTime: new Date(Date.now() + 3600000).toISOString(), capacity: 3,
    } as any)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects capacities other than 3 or 4 before persistence', async () => {
    tx.user.findUnique.mockResolvedValue({ id: 'u1', phoneVerified: true });
    await expect(service.create('u1', {
      origin: 'A', destination: 'B', departTime: new Date(Date.now() + 3600000).toISOString(), capacity: 2,
    } as any)).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.trip.create).not.toHaveBeenCalled();
  });

  it('creates a pending one-or-two-seat request without occupying active capacity', async () => {
    tx.user.findUnique.mockResolvedValue({ id: 'u2', phoneVerified: true, gender: 'FEMALE' });
    tx.trip.findUnique.mockResolvedValue({ id: 't1', capacity: 4, status: 'RECRUITING', femaleOnly: false, members: [{ memberCount: 1 }] });
    tx.tripMember.findUnique = jest.fn().mockResolvedValue(null);
    tx.tripMember.findMany.mockResolvedValue([{ memberCount: 1 }]);
    tx.tripMember.create.mockResolvedValue({ id: 'm1', tripId: 't1', userId: 'u2', memberCount: 2, status: 'PENDING' });
    const result = await service.join('u2', 't1', { memberCount: 2 } as any, 'req-1');
    expect(result.memberCount).toBe(2);
    expect(result.status).toBe('PENDING');
    expect(tx.tripMember.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ memberCount: 2, status: 'PENDING' }) }));
  });

  it('accepts a pending request atomically and enters CONFIRMING only when target seats are full', async () => {
    tx.user.findUnique.mockResolvedValue({ id: 'creator', phoneVerified: true });
    tx.trip.findUnique.mockResolvedValue({ id: 't1', creatorId: 'creator', capacity: 3, status: 'RECRUITING', members: [
      { id: 'creator-member', userId: 'creator', role: 'CREATOR', memberCount: 1, status: 'ACTIVE' },
      { id: 'pending-member', userId: 'u2', role: 'MEMBER', memberCount: 2, status: 'PENDING' },
    ] });
    tx.tripMember.findUnique
      .mockResolvedValueOnce({ id: 'pending-member', tripId: 't1', userId: 'u2', role: 'MEMBER', memberCount: 2, status: 'PENDING' })
      .mockResolvedValueOnce(null);
    tx.tripMember.update.mockResolvedValue({ id: 'pending-member', status: 'ACTIVE', acceptedAt: new Date() });
    tx.trip.update.mockResolvedValue({ id: 't1', status: 'CONFIRMING' });

    const result = await service.acceptJoin('creator', 't1', 'pending-member', 'accept-1');

    expect(result.tripStatus).toBe('CONFIRMING');
    expect(tx.tripMember.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'ACTIVE' }) }));
    expect(tx.trip.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'CONFIRMING' }) }));
  });

  it('rejects a pending request without changing active capacity', async () => {
    tx.trip.findUnique.mockResolvedValue({ id: 't1', creatorId: 'creator', status: 'RECRUITING', members: [] });
    tx.tripMember.findUnique
      .mockResolvedValueOnce({ id: 'pending-member', tripId: 't1', userId: 'u2', role: 'MEMBER', memberCount: 2, status: 'PENDING' })
      .mockResolvedValueOnce(null);
    tx.tripMember.update.mockResolvedValue({ id: 'pending-member', status: 'REJECTED' });

    const result: any = await service.rejectJoin('creator', 't1', 'pending-member', 'reject-1');

    expect(result.member.status).toBe('REJECTED');
    expect(tx.tripMember.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'REJECTED' }) }));
    expect(tx.trip.update).not.toHaveBeenCalled();
  });

  it('filters future trips by time, orders ascending, and suppresses reasons for low-credit creators', async () => {
    const near = new Date(Date.now() + 30 * 60 * 1000);
    prisma.trip.findMany.mockResolvedValue([
      { id: 't1', departTime: near, capacity: 3, femaleOnly: false, members: [{ memberCount: 1 }], creator: { creditScore: 40, phoneVerified: true, studentVerified: true } },
    ]);
    const result = await service.list({ time: `${near.getHours().toString().padStart(2, '0')}:${near.getMinutes().toString().padStart(2, '0')}` } as any);
    expect(prisma.trip.findMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { departTime: 'asc' }, where: expect.objectContaining({ departTime: expect.anything() }) }));
    expect(result[0].reasonCodes).toEqual([]);
  });

  it('returns an existing membership for a retried idempotency key', async () => {
    tx.user.findUnique.mockResolvedValue({ id: 'u2', phoneVerified: true });
    const existing = { id: 'm1', tripId: 't1', userId: 'u2', memberCount: 1 };
    tx.trip.findUnique.mockResolvedValue({ id: 't1', capacity: 4, status: 'RECRUITING', members: [{ memberCount: 1 }] });
    tx.tripMember.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(existing);
    await expect(service.join('u2', 't1', { memberCount: 1 } as any, 'req-1')).resolves.toEqual(existing);
    expect(tx.tripMember.create).not.toHaveBeenCalled();
    expect(tx.tripMember.findUnique).toHaveBeenNthCalledWith(1, { where: { joinRequestKey: 'req-1' } });
  });

  it('rejects accepting a request that would exceed remaining active capacity', async () => {
    tx.user.findUnique.mockResolvedValue({ id: 'u3', phoneVerified: true });
    tx.trip.findUnique.mockResolvedValue({ id: 't2', creatorId: 'creator', capacity: 3, status: 'RECRUITING', members: [
      { id: 'creator-member', memberCount: 1, status: 'ACTIVE' },
      { id: 'active-member', memberCount: 1, status: 'ACTIVE' },
    ] });
    tx.tripMember.findUnique
      .mockResolvedValueOnce({ id: 'pending-member', tripId: 't2', userId: 'u3', memberCount: 2, status: 'PENDING' })
      .mockResolvedValueOnce(null);
    await expect(service.acceptJoin('creator', 't2', 'pending-member', 'accept-2')).rejects.toBeInstanceOf(ConflictException);
    expect(tx.tripMember.update).not.toHaveBeenCalled();
  });
});
