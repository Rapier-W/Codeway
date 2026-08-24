import { ConflictException, ForbiddenException } from '@nestjs/common';
import { PlatformService } from './platform.service';

describe('PlatformService', () => {
  const tx: any = {
    user: { upsert: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    trip: { findUnique: jest.fn(), update: jest.fn() },
    fareOrder: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    fareDispute: { create: jest.fn() },
    rideRecord: { create: jest.fn(), findUnique: jest.fn() },
    vehicleUpdate: { create: jest.fn() },
    emergencyContact: { create: jest.fn(), findMany: jest.fn() },
    sosEvent: { create: jest.fn() },
    review: { create: jest.fn() },
    report: { create: jest.fn() },
    analyticsEvent: { create: jest.fn() },
    notificationEvent: { create: jest.fn() },
  };
  const prisma: any = { $transaction: jest.fn((fn: any) => fn(tx)) };
  let service: PlatformService;
  beforeEach(() => { jest.clearAllMocks(); service = new PlatformService(prisma); });

  it('verifies a phone and returns a user', async () => {
    tx.user.upsert.mockResolvedValue({ id: 'u1', phone: '13800000000', phoneVerified: true });
    await expect(service.verifyPhone('u1', '13800000000')).resolves.toMatchObject({ phoneVerified: true });
  });

  it('accepts the development verification code and upserts a verified user', async () => {
    tx.user.upsert.mockResolvedValue({ id: 'dev-13800000000', phone: '13800000000', phoneVerified: true, nickname: '用户0000' });
    await expect(service.verifyDevelopmentCode('13800000000', '123456')).resolves.toMatchObject({ id: 'dev-13800000000', phoneVerified: true });
    expect(tx.user.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'dev-13800000000' }, create: expect.objectContaining({ phoneVerified: true }) }));
  });

  it('rejects an invalid development verification code', async () => {
    await expect(service.verifyDevelopmentCode('13800000000', '000000')).rejects.toBeInstanceOf(ConflictException);
  });

  it('creates a ride record with manual fallback and vehicle data', async () => {
    tx.trip.findUnique.mockResolvedValue({ id: 't1', status: 'FORMED', creatorId: 'u1' });
    tx.rideRecord.create.mockResolvedValue({ id: 'r1', mode: 'MANUAL_FALLBACK', status: 'WAITING_RIDE' });
    await expect(service.openRide('t1', 'u1', 'GAODE')).resolves.toMatchObject({ mode: 'MANUAL_FALLBACK' });
    tx.vehicleUpdate.create.mockResolvedValue({ id: 'v1', plate: '粤A12345' });
    await expect(service.updateVehicle('t1', 'u1', { plate: '粤A12345', platform: 'GAODE' })).resolves.toMatchObject({ plate: '粤A12345' });
  });

  it('locks settlement and payment while a fare dispute is open', async () => {
    tx.trip.findUnique.mockResolvedValue({ id: 't1', status: 'PENDING_SETTLEMENT', creatorId: 'u1', disputeLocked: false });
    tx.fareOrder.create.mockResolvedValue({ id: 'o1', totalAmountCents: 1200, status: 'PENDING_CONFIRMATION' });
    await service.submitFareOrder('t1', 'u1', { totalAmountCents: 1200, screenshotKey: 'orders/o1.png' });
    tx.fareOrder.findUnique.mockResolvedValue({ id: 'o1', tripId: 't1', status: 'PENDING_CONFIRMATION' });
    tx.fareDispute.create.mockResolvedValue({ id: 'd1', status: 'OPEN' });
    tx.trip.update.mockResolvedValue({ id: 't1', disputeLocked: true });
    await expect(service.disputeFare('o1', 'u2', '金额不符')).resolves.toMatchObject({ status: 'OPEN' });
    expect(tx.trip.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ disputeLocked: true }) }));
  });

  it('records SOS without requiring location permission and writes notification event', async () => {
    tx.emergencyContact.findMany.mockResolvedValue([{ id: 'c1', phone: '13900000000' }]);
    tx.sosEvent.create.mockResolvedValue({ id: 's1', status: 'RECORDED' });
    tx.notificationEvent.create.mockResolvedValue({ id: 'n1', status: 'PENDING' });
    await expect(service.triggerSos('t1', 'u1', null)).resolves.toMatchObject({ id: 's1' });
    expect(tx.notificationEvent.create).toHaveBeenCalled();
  });

  it('rejects review before trip is finished', async () => {
    tx.trip.findUnique.mockResolvedValue({ id: 't1', status: 'FORMED', members: [{ userId: 'u1' }, { userId: 'u2' }] });
    await expect(service.createReview('t1', 'u1', { targetUserId: 'u2', punctuality: 5, safety: 5, politeness: 5, communication: 5 })).rejects.toBeInstanceOf(ConflictException);
  });
});
