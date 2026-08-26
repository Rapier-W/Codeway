import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { CoordinatePoint } from '../ride/ride-adapter';

export const AMAP_FETCH = Symbol('AMAP_FETCH');
export const AMAP_SERVER_KEY = Symbol('AMAP_SERVER_KEY');

export type AmapFetch = (input: string, init?: RequestInit) => Promise<{
  ok: boolean;
  json(): Promise<unknown>;
}>;

export interface RouteDistance {
  distanceMeters: number;
  durationSeconds: number;
  source: 'amap' | 'estimate';
}

@Injectable()
export class AmapService {
  constructor(
    @Inject(AMAP_FETCH) private readonly fetcher: AmapFetch,
    @Inject(AMAP_SERVER_KEY) private readonly serverKey: string,
  ) {}

  async routeDistance(origin: CoordinatePoint, destination: CoordinatePoint): Promise<RouteDistance> {
    if (!this.serverKey) return this.estimateRoute(origin, destination);

    let body: unknown;
    try {
      body = await this.get('/v3/distance', {
        origins: this.pointParam(origin),
        destination: this.pointParam(destination),
        type: '1',
      });
    } catch {
      throw new ServiceUnavailableException('AMAP_UPSTREAM_UNAVAILABLE');
    }

    const first = (body as { results?: unknown[] })?.results?.[0] as Record<string, unknown> | undefined;
    const distanceMeters = this.finiteNumber(first?.distance);
    const durationSeconds = this.finiteNumber(first?.duration);
    if (distanceMeters === undefined || durationSeconds === undefined) return this.estimateRoute(origin, destination);

    return { distanceMeters, durationSeconds, source: 'amap' };
  }

  async searchPlaces(keyword: string, city?: string) {
    if (!this.serverKey) return [];
    const body = await this.getOrUnavailable('/v3/place/text', { keywords: keyword, ...(city ? { city } : {}) });
    const pois = (body as { pois?: unknown[] })?.pois;
    if (!Array.isArray(pois)) return [];
    return pois.flatMap((item) => {
      const poi = item as Record<string, unknown>;
      const point = this.parseLocation(poi.location);
      if (!point || typeof poi.name !== 'string') return [];
      return [{ name: poi.name, address: typeof poi.address === 'string' ? poi.address : '', point }];
    });
  }

  async geocode(keyword: string, city?: string) {
    if (!this.serverKey) return [];
    const body = await this.getOrUnavailable('/v3/geocode/geo', { address: keyword, ...(city ? { city } : {}) });
    const geocodes = (body as { geocodes?: unknown[] })?.geocodes;
    if (!Array.isArray(geocodes)) return [];
    return geocodes.flatMap((item) => {
      const geocode = item as Record<string, unknown>;
      const point = this.parseLocation(geocode.location);
      if (!point) return [];
      return [{ formattedAddress: typeof geocode.formatted_address === 'string' ? geocode.formatted_address : keyword, point }];
    });
  }

  private async getOrUnavailable(path: string, params: Record<string, string>) {
    try {
      return await this.get(path, params);
    } catch {
      throw new ServiceUnavailableException('AMAP_UPSTREAM_UNAVAILABLE');
    }
  }

  private async get(path: string, params: Record<string, string>): Promise<unknown> {
    const url = new URL(`https://restapi.amap.com${path}`);
    url.searchParams.set('key', this.serverKey);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const response = await this.fetcher(url.toString(), { signal: AbortSignal.timeout(4_000) });
    if (!response.ok) throw new Error('AMAP_UPSTREAM_UNAVAILABLE');
    return response.json();
  }

  private estimateRoute(origin: CoordinatePoint, destination: CoordinatePoint): RouteDistance {
    const radians = Math.PI / 180;
    const lat1 = origin.latitude * radians;
    const lat2 = destination.latitude * radians;
    const deltaLat = (destination.latitude - origin.latitude) * radians;
    const deltaLng = (destination.longitude - origin.longitude) * radians;
    const haversine = Math.sin(deltaLat / 2) ** 2
      + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
    const distanceMeters = Math.max(1, Math.round(6_371_000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))));
    return { distanceMeters, durationSeconds: Math.max(60, Math.round(distanceMeters / 8)), source: 'estimate' };
  }

  private pointParam(point: CoordinatePoint) {
    return `${point.longitude},${point.latitude}`;
  }

  private finiteNumber(value: unknown): number | undefined {
    const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
    return Number.isFinite(number) && number >= 0 ? number : undefined;
  }

  private parseLocation(value: unknown): CoordinatePoint | undefined {
    if (typeof value !== 'string') return undefined;
    const [longitude, latitude] = value.split(',').map(Number);
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) return undefined;
    return { longitude, latitude };
  }
}
