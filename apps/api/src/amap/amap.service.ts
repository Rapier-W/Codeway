import { Injectable, Logger, NotFoundException } from '@nestjs/common';

/**
 * 高德地图服务端适配器。
 *
 * 安全边界：
 * - 服务端 Key（AMAP_SERVER_KEY）只在本类内部使用，绝不返回给前端。
 * - 浏览器 Key 是另一把，由前端自行持有，只用于地点搜索等前端能力。
 * - 前端不该也不需要拿到服务端 Key。
 *
 * 高德 Web 服务 API 文档：https://lbs.amap.com/api/webservice/guide/api
 */

export interface GeoPoint {
  longitude: number;
  latitude: number;
}

export interface PlaceResult {
  id: string;
  name: string;
  address: string;
  location: GeoPoint;
  typecode?: string;
}

export interface RouteSummary {
  distanceMeters: number;
  durationSeconds: number;
}

const AMAP_BASE = 'https://restapi.amap.com/v3';

@Injectable()
export class AmapService {
  private readonly logger = new Logger(AmapService.name);
  private readonly key: string | undefined;

  constructor() {
    this.key = process.env.AMAP_SERVER_KEY;
  }

  /** 服务端 Key 是否已配置。未配置时所有方法走空实现，允许开发者无 Key 时正常开发。 */
  get available(): boolean {
    return Boolean(this.key);
  }

  /** 地点搜索（POI 关键字）。无 Key 时返回空数组。 */
  async searchPlace(keyword: string, city?: string): Promise<PlaceResult[]> {
    if (!this.key) {
      this.logger.warn('AMAP_SERVER_KEY not set, returning empty search results');
      return [];
    }
    const url = new URL(`${AMAP_BASE}/place/text`);
    url.searchParams.set('key', this.key);
    url.searchParams.set('keywords', keyword);
    if (city) url.searchParams.set('city', city);
    url.searchParams.set('offset', '20');
    url.searchParams.set('page', '1');
    url.searchParams.set('extensions', 'base');

    const data = await this.fetchJson(url);
    if (!data?.pois?.length) return [];
    return data.pois.map((p: any) => this.toPlace(p));
  }

  /** 地理编码：地址转经纬度。无 Key 时返回 null。 */
  async geocode(address: string, city?: string): Promise<GeoPoint | null> {
    if (!this.key) {
      this.logger.warn('AMAP_SERVER_KEY not set, geocode unavailable');
      return null;
    }
    const url = new URL(`${AMAP_BASE}/geocode/geo`);
    url.searchParams.set('key', this.key);
    url.searchParams.set('address', address);
    if (city) url.searchParams.set('city', city);

    const data = await this.fetchJson(url);
    if (!data?.geocodes?.length) return null;
    const loc = String(data.geocodes[0].location).split(',');
    if (loc.length !== 2) return null;
    return { longitude: Number(loc[0]), latitude: Number(loc[1]) };
  }

  /**
   * 路线距离与时间估算。
   * origin 和 destination 是"经度,纬度"格式的坐标字符串（高德要求 lng,lat 顺序）。
   * 无 Key 时返回估算值（按直线距离 *1.4 系数估算），不阻塞流程。
   */
  async routeDistance(origin: GeoPoint, destination: GeoPoint): Promise<RouteSummary> {
    if (!this.key) {
      this.logger.warn('AMAP_SERVER_KEY not set, using rough estimate');
      const dist = this.haversine(origin, destination);
      return { distanceMeters: Math.round(dist), durationSeconds: Math.round((dist / 1000 / 40) * 3600) };
    }

    const url = new URL(`${AMAP_BASE}/distance`);
    url.searchParams.set('key', this.key);
    url.searchParams.set('origins', `${origin.longitude},${origin.latitude}`);
    url.searchParams.set('destination', `${destination.longitude},${destination.latitude}`);
    url.searchParams.set('type', '1'); // 驾车

    const data = await this.fetchJson(url);
    if (!data?.route?.paths?.length) {
      const dist = this.haversine(origin, destination);
      return { distanceMeters: Math.round(dist), durationSeconds: Math.round((dist / 1000 / 40) * 3600) };
    }
    const path = data.route.paths[0];
    return {
      distanceMeters: Math.round(Number(path.distance)),
      durationSeconds: Math.round(Number(path.duration)),
    };
  }

  private toPlace(p: any): PlaceResult {
    const loc = String(p.location ?? '').split(',');
    return {
      id: String(p.id ?? p.uid ?? ''),
      name: String(p.name ?? ''),
      address: String(p.address ?? ''),
      location: { longitude: Number(loc[0] ?? 0), latitude: Number(loc[1] ?? 0) },
      typecode: p.typecode ? String(p.typecode) : undefined,
    };
  }

  private async fetchJson(url: URL): Promise<any> {
    const response = await fetch(url.toString(), { method: 'GET' });
    if (!response.ok) throw new NotFoundException('AMAP_REQUEST_FAILED');
    return response.json();
  }

  /** Haversine 公式估算直线距离（米），用于无 Key 时的降级。 */
  private haversine(a: GeoPoint, b: GeoPoint): number {
    const R = 6371000;
    const dLat = this.toRad(b.latitude - a.latitude);
    const dLng = this.toRad(b.longitude - a.longitude);
    const lat1 = this.toRad(a.latitude);
    const lat2 = this.toRad(b.latitude);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  private toRad(deg: number): number {
    return (deg * Math.PI) / 180;
  }
}
