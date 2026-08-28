import { Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';

/**
 * 微信小程序登录适配器。
 *
 * 流程：wx.login 拿 code → 后端用 code+AppID+AppSecret 调微信 jscode2session → 拿到 openid+session_key。
 *
 * 安全边界：
 * - AppSecret 只在后端使用，绝不返回给前端。
 * - session_key 只在后端保存（用于后续解密手机号等），不返回给前端。
 * - 微信 API 失败时返回 401，不泄露微信的错误细节。
 *
 * 环境变量：
 * - WECHAT_APPID：小程序 AppID
 * - WECHAT_APP_SECRET：小程序 AppSecret
 */
@Injectable()
export class WechatService {
  private readonly logger = new Logger(WechatService.name);

  get configured(): boolean {
    return Boolean(process.env.WECHAT_APPID && process.env.WECHAT_APP_SECRET);
  }

  /**
   * 用 wx.login 的 code 换取微信 openid 和 session_key。
   * 返回 { openid, sessionKey }，失败抛 401。
   */
  async code2session(code: string): Promise<{ openid: string; sessionKey: string }> {
    const appid = process.env.WECHAT_APPID;
    const secret = process.env.WECHAT_APP_SECRET;

    if (!appid || !secret) {
      this.logger.warn('WECHAT_APPID or WECHAT_APP_SECRET not set, wx login unavailable');
      throw new ServiceUnavailableException('WECHAT_NOT_CONFIGURED');
    }

    const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${appid}&secret=${secret}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`;

    let data: any;
    try {
      const response = await fetch(url);
      data = await response.json();
    } catch {
      this.logger.error('WeChat API request failed');
      throw new ServiceUnavailableException('WECHAT_API_UNAVAILABLE');
    }

    if (data?.errcode) {
      // 微信返回错误码，不把原始错误暴露给前端
      this.logger.error(`WeChat jscode2session failed: errcode=${data.errcode} errmsg=${data.errmsg}`);
      throw new UnauthorizedException('WECHAT_CODE_INVALID');
    }

    if (!data?.openid || !data?.session_key) {
      throw new UnauthorizedException('WECHAT_CODE_INVALID');
    }

    return { openid: data.openid, sessionKey: data.session_key };
  }

  /**
   * 生成微信用户的内部 ID：openid 的 SHA-256 前 32 位。
   * 用哈希而不是原始 openid，避免 openid 直接出现在数据库主键里。
   */
  openidToUserId(openid: string): string {
    return crypto.createHash('sha256').update(openid).digest('hex').slice(0, 32);
  }
}
