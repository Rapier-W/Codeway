import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { IdempotencyKey } from '../common/idempotency-key.decorator';
import { Public } from '../auth/public.decorator';
import { RideService } from './ride.service';
import { AmapService } from '../amap/amap.service';

@Public()
@Controller('ride')
export class RideController {
  constructor(
    private readonly ride: RideService,
    private readonly amap: AmapService,
  ) {}

  /** 列出所有已注册叫车平台及其能力，供前端展示选择。 */
  @Get('platforms')
  platforms() {
    return this.ride.listPlatforms();
  }

  /** 查询指定平台的能力。 */
  @Get('platforms/:platform')
  capability(@Param('platform') platform: string) {
    return this.ride.getCapabilities(platform);
  }

  /**
   * 根据行程信息生成跳转链接或降级路线。
   * 调用方传起终点和出发时间，适配器决定走深链还是复制降级。
   */
  @Post('open')
  openRide(
    @Body() body: { origin: string; destination: string; departureAt?: string; platform?: string },
    @IdempotencyKey(false) _key: string,
  ) {
    return this.ride.openRide({
      origin: body.origin,
      destination: body.destination,
      departureAt: body.departureAt,
      platform: body.platform,
    });
  }

  // —— 高德地图能力（服务端 Key 不外泄） ——

  /** 地点搜索。无 AMAP_SERVER_KEY 时返回空数组，不报错。 */
  @Get('places')
  async searchPlace(@Query('keyword') keyword: string, @Query('city') city?: string) {
    return await this.amap.searchPlace(keyword ?? '', city);
  }

  /** 地理编码：地址转经纬度。无 Key 时返回 null。 */
  @Get('geocode')
  async geocode(@Query('address') address: string, @Query('city') city?: string) {
    if (!address?.trim()) return { location: null };
    const location = await this.amap.geocode(address, city);
    return { location };
  }

  /** 路线距离和时间估算。 */
  @Get('route')
  async route(
    @Query('originLng') originLng: string,
    @Query('originLat') originLat: string,
    @Query('destLng') destLng: string,
    @Query('destLat') destLat: string,
  ) {
    return await this.amap.routeDistance(
      { longitude: Number(originLng), latitude: Number(originLat) },
      { longitude: Number(destLng), latitude: Number(destLat) },
    );
  }
}
