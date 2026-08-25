import { ForbiddenException } from '@nestjs/common';
import { PlatformService } from './platform.service';

describe('PlatformService', () => {
  const tx: any = {
    user: { upsert: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    trip: { findUnique: jest.fn(), update: jest.fn() },
    tripMember: { findUnique: jest.fn() },
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

  it('creates a ride record with manual fallback and vehicle data', async () => {
    tx.trip.findUnique.mockResolvedValue({ id: 't1', status: 'FORMED', creatorId: 'u1' });
    tx.rideRecord.create.mockResolvedValue({ id: 'r1', mode: 'MANUAL_FALLBACK', status: 'WAITING_RIDE' });
    await expect(service.openRide('t1', 'u1', 'GAODE')).resolves.toMatchObject({ mode: 'MANUAL_FALLBACK' });
    tx.vehicleUpdate.create.mockResolvedValue({ id: 'v1', plate: '粤A12345' });
    await expect(service.updateVehicle('t1', 'u1', { plate: '粤A12345', platform: 'GAODE' })).resolves.toMatchObject({ plate: '粤A12345' });
  });


  it('records SOS without requiring location permission and writes notification event', async () => {
    tx.trip.findUnique.mockResolvedValue({ id: 't1' });
    tx.tripMember.findUnique.mockResolvedValue({ id: 'm1', tripId: 't1', userId: 'u1' });
    tx.sosEvent.findUnique = jest.fn().mockResolvedValue(null);
    tx.emergencyContact.findMany.mockResolvedValue([{ id: 'c1', phone: '13900000000' }]);
    tx.sosEvent.create.mockResolvedValue({ id: 's1', status: 'RECORDED' });
    tx.notificationEvent.create.mockResolvedValue({ id: 'n1', status: 'PENDING' });
    await expect(service.triggerSos('t1', 'u1', {}, 'sos-key')).resolves.toMatchObject({ id: 's1' });
    expect(tx.sosEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ requestKey: 'sos-key', note: null }) }));
    expect(tx.notificationEvent.create).toHaveBeenCalled();
  });

  it('rejects SOS from a user who is not a trip member', async () => {
    tx.trip.findUnique.mockResolvedValue({ id: 't1' });
    tx.tripMember.findUnique.mockResolvedValue(null);
    await expect(service.triggerSos('t1', 'u3', {}, 'sos-key')).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.sosEvent.create).not.toHaveBeenCalled();
  });
});
