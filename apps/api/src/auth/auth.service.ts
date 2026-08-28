import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma.service';
import { SmsService } from './sms.service';
import { WechatService } from './wechat.service';

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const COOKIE_NAME = 'tongluxing_session';

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: SmsService,
    private readonly wechat: WechatService,
  ) {}

  async onModuleInit(): Promise<void> {
    // Best-effort startup sweep of already-expired sessions. Lazy per-request
    // cleanup alone would let expired rows accumulate over time. No-op when
    // there is no live database connection (e.g. unit tests / SKIP_DB_CONNECT).
    if (process.env.DATABASE_URL && process.env.SKIP_DB_CONNECT !== 'true') {
      if (this.prisma.session?.deleteMany) {
        await this.prisma.session
          .deleteMany({ where: { expiresAt: { lt: new Date() } } })
          .catch(() => {});
      }
    }
  }

  /**
   * Send a verification code to the phone number.
   */
  async requestCode(phone: string, requestIp?: string): Promise<void> {
    await this.sms.sendCode(phone, requestIp);
  }

  /**
   * Verify the code and create a session.
   * Returns the user object and sets the session cookie.
   */
  async verifyCode(phone: string, code: string, requestInfo?: { ip?: string; userAgent?: string }) {
    phone = this.normalizePhone(phone);
    await this.sms.verifyCode(phone, code);

    // Upsert user: create if not exists, always mark phone as verified
    const userId = `dev-${phone}`;
    const nickname = `用户${phone.slice(-4)}`;
    const user = await this.prisma.user.upsert({
      where: { id: userId },
      create: { id: userId, phone, phoneVerified: true, nickname },
      update: { phone, phoneVerified: true, nickname },
    });

    // Create session. Store ONLY the SHA-256 hash of the token; the raw token
    // lives solely inside the HttpOnly cookie, so a DB leak cannot be replayed
    // to hijack sessions.
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await this.prisma.session.create({
      data: {
        userId: user.id,
        token: tokenHash,
        ipAddress: requestInfo?.ip ?? null,
        userAgent: requestInfo?.userAgent ?? null,
        expiresAt,
      },
    });

    return { user, token, cookieOptions: this.buildCookieOptions(expiresAt) };
  }

  /**
   * Look up a user by session token.
   * Returns the user if the session is valid, null otherwise.
   */
  async getUserByToken(token: string) {
    if (!token) return null;
    const session = await this.prisma.session?.findUnique({
      where: { token: this.hashToken(token) },
      include: { user: true },
    });
    if (!session) return null;
    if (Date.now() >= session.expiresAt.getTime()) {
      if (this.prisma.session?.delete) {
        await this.prisma.session.delete({ where: { id: session.id } }).catch(() => {});
      }
      return null;
    }
    return session.user;
  }

  /**
   * 微信小程序登录：用 wx.login 的 code 换取 openid，创建/查找用户，创建会话。
   * 不需要短信验证码，个人小程序即可使用。
   */
  async wechatLogin(code: string, requestInfo?: { ip?: string; userAgent?: string }) {
    const { openid, sessionKey } = await this.wechat.code2session(code);
    const userId = this.wechat.openidToUserId(openid);

    // 用 openid 哈希作为用户 ID，sessionKey 存在用户记录里（后续解密手机号用）
    const user = await this.prisma.user.upsert({
      where: { id: userId },
      create: { id: userId, phoneVerified: false },
      update: {},
    });

    // 创建会话
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await this.prisma.session.create({
      data: {
        userId: user.id,
        token: tokenHash,
        ipAddress: requestInfo?.ip ?? null,
        userAgent: requestInfo?.userAgent ?? null,
        expiresAt,
      },
    });

    return { user: { id: user.id, nickname: user.nickname, phoneVerified: user.phoneVerified }, token, cookieOptions: this.buildCookieOptions(expiresAt) };
  }

  /**
   * Destroy a session by token (logout).
   */
  async logout(token: string): Promise<void> {
    if (!token) return;
    if (this.prisma.session?.deleteMany) {
      await this.prisma.session.deleteMany({ where: { token: this.hashToken(token) } });
    }
  }

  /**
   * Get user by ID (used only by the dev-only x-user-id fallback in AuthGuard).
   */
  async getUserById(userId: string) {
    if (!userId) throw new NotFoundException('USER_NOT_FOUND');
    if (!this.prisma.user?.findUnique) {
      // Fallback for environments without a real database (mock/tests)
      return { id: userId, phoneVerified: true };
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('USER_NOT_FOUND');
    return user;
  }

  get cookieName() { return COOKIE_NAME; }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private normalizePhone(phone: string): string {
    return String(phone ?? '').replace(/[\s-]/g, '').replace(/^\+?86/, '');
  }

  private buildCookieOptions(expiresAt: Date) {
    const isProduction = process.env.NODE_ENV === 'production';
    // 跨站策略：默认 lax（同域 Nginx 反代场景最安全，可防 CSRF）；
    // 若 API 与前端跨域部署（如不同子域/独立 API 域名）需设为 none，此时必须 secure。
    const requestedSameSite = (process.env.COOKIE_SAME_SITE || 'lax').toLowerCase();
    const sameSite: 'lax' | 'strict' | 'none' = requestedSameSite === 'none' ? 'none' : requestedSameSite === 'strict' ? 'strict' : 'lax';
    const secure = isProduction || sameSite === 'none';
    return {
      httpOnly: true,
      secure,
      sameSite,
      path: '/',
      expires: expiresAt,
      maxAge: SESSION_TTL_MS / 1000,
      domain: process.env.COOKIE_DOMAIN || undefined,
    };
  }
}
