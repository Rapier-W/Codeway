import { ForbiddenException } from '@nestjs/common';
import { PlatformService } from './platform.service';
import { RideService } from '../ride/ride.service';

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
  const ride: Pick<RideService, 'openRide'> = {
    openRide: jest.fn().mockReturnValue({
      platform: 'amap',
      fallbackLevel: 'copy-route',
      copyRouteText: '起点：A；终点：B',
      hint: '将在浏览器中打开高德地图导航，不创建叫车订单。',
    }),
  };
  let service: PlatformService;
  beforeEach(() => { jest.clearAllMocks(); service = new PlatformService(prisma, ride as RideService); });

  it('verifies a phone and returns a user', async () => {
    tx.user.upsert.mockResolvedValue({ id: 'u1', phone: '13800000000', phoneVerified: true });
    await expect(service.verifyPhone('u1', '13800000000')).resolves.toMatchObject({ phoneVerified: true });
  });

  it('opens a formed trip with the adapter launch result and returns it unchanged on a duplicate request key', async () => {
    tx.trip.findUnique.mockResolvedValue({ id: 't1', status: 'FORMED', creatorId: 'u1', origin: 'A', destination: 'B', departTime: new Date('2026-08-27T10:00:00.000Z') });
    tx.rideRecord.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'r1', tripId: 't1', requestedBy: 'u1', platform: 'amap', requestKey: 'ride-key', mode: 'MANUAL_FALLBACK', status: 'WAITING_RIDE',
    });
    tx.rideRecord.create.mockResolvedValue({ id: 'r1', tripId: 't1', requestedBy: 'u1', platform: 'amap', requestKey: 'ride-key', mode: 'MANUAL_FALLBACK', status: 'WAITING_RIDE' });

    const first = await service.openRide('t1', 'u1', 'amap', 'ride-key');
    const duplicate = await service.openRide('t1', 'u1', 'amap', 'ride-key');

    expect(first.launch).toEqual({ platform: 'amap', fallbackLevel: 'copy-route', copyRouteText: '起点：A；终点：B', hint: '将在浏览器中打开高德地图导航，不创建叫车订单。' });
    expect(duplicate.launch).toEqual(first.launch);
    expect(tx.trip.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { status: 'WAITING_RIDE' } });
    expect(ride.openRide).toHaveBeenCalledWith(expect.objectContaining({ platform: 'amap', origin: 'A', destination: 'B' }));

    tx.vehicleUpdate.create.mockResolvedValue({ id: 'v1', plate: '粤A12345' });
    await expect(service.updateVehicle('t1', 'u1', { plate: '粤A12345', platform: 'GAODE' })).resolves.toMatchObject({ plate: '粤A12345' });
  });

  it('rejects an unknown platform even when called outside the HTTP DTO boundary', async () => {
    await expect(service.openRide('t1', 'u1', 'unknown' as any, 'bad-platform')).rejects.toMatchObject({ response: { message: 'RIDE_PLATFORM_INVALID' } });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a non-creator and a booked trip before creating a ride record', async () => {
    tx.trip.findUnique.mockResolvedValueOnce({ id: 't1', status: 'FORMED', creatorId: 'u1' });
    await expect(service.openRide('t1', 'u2', 'manual', 'member-key')).rejects.toBeInstanceOf(ForbiddenException);

    tx.trip.findUnique.mockResolvedValueOnce({ id: 't1', status: 'RIDE_BOOKED', creatorId: 'u1' });
    await expect(service.openRide('t1', 'u1', 'manual', 'booked-key')).rejects.toMatchObject({ response: { message: 'TRIP_NOT_READY_FOR_RIDE' } });
    expect(tx.rideRecord.create).not.toHaveBeenCalled();
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
