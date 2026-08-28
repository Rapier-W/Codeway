import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { SendSmsDto } from './dto/send-sms.dto';
import { VerifySmsDto } from './dto/verify-sms.dto';
import { WechatLoginDto } from './dto/wechat-login.dto';
import { Public } from './public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /**
   * Send SMS verification code.
   * Rate limited via @nestjs/throttler + custom phone-level limiting in SmsService.
   */
  @Public()
  @Throttle({ auth: { limit: 10, ttl: 60_000 } })
  @Post('request-code')
  @HttpCode(204)
  async requestCode(@Body() dto: SendSmsDto, @Req() req: any): Promise<void> {
    const ip = req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim();
    await this.auth.requestCode(dto.phone, ip);
  }

  /**
   * Verify SMS code and create a session.
   * Sets HttpOnly cookie on success.
   */
  @Public()
  @Throttle({ auth: { limit: 10, ttl: 60_000 } })
  @Post('verify-code')
  async verifyCode(@Body() dto: VerifySmsDto, @Req() req: any, @Res({ passthrough: true }) res: Response) {
    const ip = req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim();
    const userAgent = req.headers['user-agent'];
    const { user, token, cookieOptions } = await this.auth.verifyCode(dto.phone, dto.code, { ip, userAgent });
    res.cookie(this.auth.cookieName, token, cookieOptions);
    return { id: user.id, nickname: user.nickname, phoneVerified: user.phoneVerified };
  }

  /**
   * 微信小程序登录：用 wx.login 的 code 换取身份，创建会话。
   * 不需要短信验证码，个人小程序即可使用。
   */
  @Public()
  @Throttle({ auth: { limit: 10, ttl: 60_000 } })
  @Post('wechat-login')
  async wechatLogin(@Body() dto: WechatLoginDto, @Req() req: any, @Res({ passthrough: true }) res: Response) {
    const ip = req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim();
    const userAgent = req.headers['user-agent'];
    const { user, token, cookieOptions } = await this.auth.wechatLogin(dto.code, { ip, userAgent });
    res.cookie(this.auth.cookieName, token, cookieOptions);
    return user;
  }

  /**
   * Get current authenticated user.
   */
  @Get('me')
  async me(@Req() req: any) {
    return req.user;
  }

  /**
   * Logout: destroy session and clear cookie.
   */
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: any, @Res({ passthrough: true }) res: Response): Promise<void> {
    const token = req.cookies?.[this.auth.cookieName];
    await this.auth.logout(token);
    res.clearCookie(this.auth.cookieName, { path: '/' });
  }
}
