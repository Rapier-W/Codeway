import { RideService } from './ride.service';

describe('RideService', () => {
  it('does not produce an Amap deep link until both validated coordinates exist', () => {
    const service = new RideService({} as any);

    const result = service.openRide({
      origin: '同济大学四平路校区',
      destination: '上海虹桥站',
      originPoint: { longitude: 121.512, latitude: 31.283 },
      platform: 'amap',
    });

    expect(result).toMatchObject({
      platform: 'amap',
      fallbackLevel: 'copy-route',
      copyRouteText: '起点：同济大学四平路校区；终点：上海虹桥站',
    });
    expect(result.deeplink).toBeUndefined();
    expect(result.hint).toMatch(/不创建叫车订单/);
  });

  it('creates a navigation-only Amap deep link when both coordinates are valid', () => {
    const service = new RideService({} as any);

    const result = service.openRide({
      origin: '同济大学四平路校区',
      destination: '上海虹桥站',
      originPoint: { longitude: 121.512, latitude: 31.283 },
      destinationPoint: { longitude: 121.326, latitude: 31.197 },
      platform: 'amap',
    });

    expect(result.fallbackLevel).toBe('deeplink');
    expect(result.deeplink).toContain('uri.amap.com/navigation');
    expect(result.hint).toMatch(/不创建叫车订单/);
  });
});
