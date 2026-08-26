import { RideService } from './ride.service';

describe('RideService', () => {
  let service: RideService;

  beforeEach(() => {
    service = new RideService();
  });

  describe('listPlatforms', () => {
    it('returns all registered platforms with capabilities', () => {
      const platforms = service.listPlatforms();
      expect(platforms).toHaveLength(3);
      const amap = platforms.find((p) => p.platform === 'amap');
      expect(amap?.canDeepLink).toBe(true);
      expect(amap?.canCopyRoute).toBe(true);
      expect(amap?.canLaunch).toBe(false);
      const didi = platforms.find((p) => p.platform === 'didi');
      expect(didi?.canDeepLink).toBe(false);
      expect(didi?.canCopyRoute).toBe(true);
      const manual = platforms.find((p) => p.platform === 'manual');
      expect(manual?.canLaunch).toBe(false);
      expect(manual?.canDeepLink).toBe(false);
    });
  });

  describe('getCapabilities', () => {
    it('returns capabilities for a known platform', () => {
      const caps = service.getCapabilities('amap');
      expect(caps.platform).toBe('amap');
      expect(caps.canDeepLink).toBe(true);
    });

    it('falls back to amap for unknown platform', () => {
      const caps = service.getCapabilities('nonexistent');
      expect(caps.platform).toBe('amap');
    });
  });

  describe('openRide', () => {
    it('generates deeplink for amap', () => {
      const result = service.openRide({ origin: '西门', destination: '南站', platform: 'amap', departureAt: '2026-12-01T10:00:00Z' });
      expect(result.platform).toBe('amap');
      expect(result.fallbackLevel).toBe('deeplink');
      expect(result.deeplink).toContain('uri.amap.com/navigation');
      expect(result.copyRouteText).toContain('西门');
      expect(result.copyRouteText).toContain('南站');
      expect(result.copyRouteText).toContain('出发时间');
    });

    it('falls back to copy for didi (no deeplink support)', () => {
      const result = service.openRide({ origin: 'A', destination: 'B', platform: 'didi' });
      expect(result.platform).toBe('didi');
      expect(result.fallbackLevel).toBe('copy');
      expect(result.deeplink).toBeUndefined();
      expect(result.copyRouteText).toContain('A');
    });

    it('uses manual fallback for manual platform', () => {
      const result = service.openRide({ origin: 'A', destination: 'B', platform: 'manual' });
      expect(result.platform).toBe('manual');
      expect(result.fallbackLevel).toBe('manual');
    });

    it('defaults to amap when platform is not specified', () => {
      const result = service.openRide({ origin: 'A', destination: 'B' });
      expect(result.platform).toBe('amap');
      expect(result.fallbackLevel).toBe('deeplink');
    });
  });
});
