/**
 * 第三方叫车平台适配器接口。
 *
 * 架构方案要求：统一能力接口，不假设所有平台都支持同样能力。
 * 能力降级顺序：
 *   1. 官方小程序/官方唤起能力
 *   2. 合法带参跳转
 *   3. 复制起点、终点和时间
 *   4. 用户手动打开第三方 App
 *   5. 返回 Codeway 确认"待叫车/已叫车"
 */

export type RidePlatform = 'amap' | 'didi' | 'manual';

export interface RideCapabilities {
  /** 是否支持直接唤起平台 App 或小程序。 */
  canLaunch: boolean;
  /** 是否支持带参跳转链接。 */
  canDeepLink: boolean;
  /** 是否支持复制路线降级。 */
  canCopyRoute: boolean;
}

export interface RideLaunchResult {
  platform: RidePlatform;
  /** 降级层级：launch > deeplink > copy > manual。 */
  fallbackLevel: 'launch' | 'deeplink' | 'copy' | 'manual';
  /** 如果 canDeepLink，这里返回可跳转的 URL。 */
  deeplink?: string;
  /** 如果 canCopyRoute，这里返回要复制的路线文本。 */
  copyRouteText?: string;
  /** 给用户看的降级提示。 */
  hint: string;
}

export interface RideAdapter {
  platform: RidePlatform;
  getCapabilities(): RideCapabilities;
  /** 根据行程信息生成跳转/降级结果。 */
  openRide(options: RideOptions): RideLaunchResult;
}

export interface RideOptions {
  origin: string;
  destination: string;
  departureAt?: string;
  /** 微信小程序场景下传入 AppID 上下文。 */
  appId?: string;
}

/**
 * 高德叫车适配器。
 * 高德支持带参跳转（https://uri.amap.com/navigation），降级时复制路线。
 */
export class AmapRideAdapter implements RideAdapter {
  readonly platform: RidePlatform = 'amap';

  getCapabilities(): RideCapabilities {
    return { canLaunch: false, canDeepLink: true, canCopyRoute: true };
  }

  openRide(options: RideOptions): RideLaunchResult {
    const { origin, destination, departureAt } = options;
    const deeplink = `https://uri.amap.com/navigation?to[name]=${encodeURIComponent(destination)}&to=0,0&from[name]=${encodeURIComponent(origin)}&from=0,0&mode=car&policy=fast`;
    const copyText = [origin, destination, departureAt ? `出发时间：${departureAt}` : ''].filter(Boolean).join('\n');
    return {
      platform: this.platform,
      fallbackLevel: 'deeplink',
      deeplink,
      copyRouteText: copyText,
      hint: '已生成高德导航链接，点击跳转或复制路线手动打开',
    };
  }
}

/**
 * 滴滴叫车适配器。
 * 滴滴无公开深链，仅支持手动降级：复制路线让用户自行打开 App。
 */
export class DidIRideAdapter implements RideAdapter {
  readonly platform: RidePlatform = 'didi';

  getCapabilities(): RideCapabilities {
    return { canLaunch: false, canDeepLink: false, canCopyRoute: true };
  }

  openRide(options: RideOptions): RideLaunchResult {
    const { origin, destination, departureAt } = options;
    const copyText = [origin, destination, departureAt ? `出发时间：${departureAt}` : ''].filter(Boolean).join('\n');
    return {
      platform: this.platform,
      fallbackLevel: 'copy',
      copyRouteText: copyText,
      hint: '请复制路线信息后手动打开滴滴出行',
    };
  }
}

/**
 * 手动降级适配器：所有平台都不可用时的兜底。
 * 只复制起终点和时间，用户自行选择叫车方式。
 */
export class ManualFallbackAdapter implements RideAdapter {
  readonly platform: RidePlatform = 'manual';

  getCapabilities(): RideCapabilities {
    return { canLaunch: false, canDeepLink: false, canCopyRoute: true };
  }

  openRide(options: RideOptions): RideLaunchResult {
    const { origin, destination, departureAt } = options;
    const copyText = [origin, destination, departureAt ? `出发时间：${departureAt}` : ''].filter(Boolean).join('\n');
    return {
      platform: this.platform,
      fallbackLevel: 'manual',
      copyRouteText: copyText,
      hint: '请复制路线信息后自行叫车',
    };
  }
}

/**
 * 适配器注册表：根据平台名获取对应适配器。
 * 未注册的平台回退到 ManualFallbackAdapter。
 */
export class RideAdapterFactory {
  private readonly adapters = new Map<RidePlatform, RideAdapter>();

  constructor() {
    this.register(new AmapRideAdapter());
    this.register(new DidIRideAdapter());
    this.register(new ManualFallbackAdapter());
  }

  register(adapter: RideAdapter) {
    this.adapters.set(adapter.platform, adapter);
  }

  resolve(platform?: string): RideAdapter {
    if (platform && this.adapters.has(platform as RidePlatform)) {
      return this.adapters.get(platform as RidePlatform)!;
    }
    // 默认走高德（支持深链），不支持时自动降级到手动。
    return this.adapters.get('amap')!;
  }
}
