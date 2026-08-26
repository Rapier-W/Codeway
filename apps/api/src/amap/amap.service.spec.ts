import { AmapService } from './amap.service';

describe('AmapService', () => {
  const origin = { longitude: 116.397, latitude: 39.908 };
  const destination = { longitude: 116.407, latitude: 39.918 };

  it('parses finite distance and duration from the first upstream result', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ distance: '1520', duration: '360' }] }),
    });
    const service = new AmapService(fetcher as any, 'server-only-key');

    await expect(service.routeDistance(origin, destination)).resolves.toEqual({
      distanceMeters: 1520,
      durationSeconds: 360,
      source: 'amap',
    });
  });

  it('estimates a route locally when no server key is configured', async () => {
    const fetcher = jest.fn();
    const service = new AmapService(fetcher as any, '');

    const route = await service.routeDistance(origin, destination);

    expect(route.source).toBe('estimate');
    expect(route.distanceMeters).toBeGreaterThan(0);
    expect(route.durationSeconds).toBeGreaterThan(0);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('maps aborted or unavailable upstream requests to a controlled error', async () => {
    const service = new AmapService(jest.fn().mockRejectedValue(new Error('network unreachable')) as any, 'server-only-key');

    await expect(service.routeDistance(origin, destination)).rejects.toEqual(
      expect.objectContaining({ message: 'AMAP_UPSTREAM_UNAVAILABLE' }),
    );
  });
});
