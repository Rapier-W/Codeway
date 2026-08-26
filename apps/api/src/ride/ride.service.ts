import { BadRequestException, Injectable } from '@nestjs/common';
import { AmapService } from '../amap/amap.service';
import { OpenRideInput, OpenRideResult, RIDE_PLATFORMS, RidePlatform, CoordinatePoint } from './ride-adapter';
import { RideMapQueryDto } from './dto/ride-map-query.dto';

@Injectable()
export class RideService {
  constructor(private readonly amap: AmapService) {}

  async places(dto: RideMapQueryDto) {
    return this.amap.searchPlaces(this.requireKeyword(dto.keyword), dto.city);
  }

  async geocode(dto: RideMapQueryDto) {
    return this.amap.geocode(this.requireKeyword(dto.keyword), dto.city);
  }

  async route(dto: RideMapQueryDto) {
    return this.amap.routeDistance(
      this.requirePoint(dto.originLongitude, dto.originLatitude),
      this.requirePoint(dto.destinationLongitude, dto.destinationLatitude),
    );
  }

  openRide(input: OpenRideInput): OpenRideResult {
    if (!RIDE_PLATFORMS.includes(input.platform)) throw new BadRequestException('RIDE_PLATFORM_INVALID');
    const copyRouteText = `起点：${input.origin}；终点：${input.destination}`;
    const hint = input.platform === 'amap'
      ? '将在浏览器中打开高德地图导航，不创建叫车订单。'
      : '请在对应出行应用中手动输入路线，本服务不创建叫车订单。';

    if (input.platform !== 'amap' || !this.isValidPoint(input.originPoint) || !this.isValidPoint(input.destinationPoint)) {
      return { platform: input.platform, fallbackLevel: 'copy-route', copyRouteText, hint };
    }

    return {
      platform: input.platform,
      fallbackLevel: 'deeplink',
      deeplink: this.amapDeeplink(input.originPoint, input.destinationPoint, input.origin, input.destination),
      copyRouteText,
      hint,
    };
  }

  private requireKeyword(keyword: string | undefined) {
    if (!keyword?.trim()) throw new BadRequestException('MAP_KEYWORD_REQUIRED');
    return keyword.trim();
  }

  private requirePoint(longitude: number | undefined, latitude: number | undefined): CoordinatePoint {
    const point = { longitude, latitude };
    if (!this.isValidPoint(point)) throw new BadRequestException('MAP_COORDINATE_REQUIRED');
    return point as CoordinatePoint;
  }

  private isValidPoint(point: Partial<CoordinatePoint> | undefined): point is CoordinatePoint {
    return Number.isFinite(point?.longitude)
      && Number.isFinite(point?.latitude)
      && (point?.longitude as number) >= -180
      && (point?.longitude as number) <= 180
      && (point?.latitude as number) >= -90
      && (point?.latitude as number) <= 90
      && (point?.longitude !== 0 || point?.latitude !== 0);
  }

  private amapDeeplink(origin: CoordinatePoint, destination: CoordinatePoint, originName: string, destinationName: string) {
    const url = new URL('https://uri.amap.com/navigation');
    url.searchParams.set('from', `${origin.longitude},${origin.latitude},${originName}`);
    url.searchParams.set('to', `${destination.longitude},${destination.latitude},${destinationName}`);
    url.searchParams.set('mode', 'car');
    url.searchParams.set('callnative', '1');
    return url.toString();
  }
}
