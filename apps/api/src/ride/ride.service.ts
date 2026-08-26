import { Injectable } from '@nestjs/common';
import { RideAdapterFactory, type RideAdapter, type RideLaunchResult, type RideOptions } from './ride-adapter';

/**
 * 叫车服务：根据行程信息选择适配器并生成跳转/降级结果。
 *
 * 职责：
 * - 接收平台参数，通过工厂解析到具体适配器。
 * - 适配器内部决定降级层级（launch / deeplink / copy / manual）。
 * - 本服务不关心前端怎么展示，只返回结构化结果。
 */
@Injectable()
export class RideService {
  private readonly factory = new RideAdapterFactory();

  /** 查询指定平台支持的能力。 */
  getCapabilities(platform?: string) {
    const adapter = this.factory.resolve(platform);
    const caps = adapter.getCapabilities();
    return { platform: adapter.platform, ...caps };
  }

  /**
   * 根据行程信息生成跳转或降级结果。
   * 如果指定的平台不支持深链，适配器内部会自动降级到复制路线。
   */
  openRide(options: RideOptions & { platform?: string }): RideLaunchResult {
    const adapter = this.factory.resolve(options.platform);
    return adapter.openRide({ origin: options.origin, destination: options.destination, departureAt: options.departureAt });
  }

  /** 列出所有已注册平台及其能力，供前端展示选择。 */
  listPlatforms() {
    return ['amap', 'didi', 'manual'].map((p) => {
      const adapter = this.factory.resolve(p);
      const caps = adapter.getCapabilities();
      return { platform: adapter.platform, ...caps };
    });
  }
}
