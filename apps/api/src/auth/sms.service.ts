import { BadRequestException, ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma.service';

const CODE_LENGTH = 6;
const CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds between sends
const DAILY_LIMIT = 5; // max 5 SMS per phone per day
const MAX_ATTEMPTS = 5; // max 5 verification attempts per code

@Injectable()
export class SmsService {
  constructor(private readonly prisma: PrismaService) {}

  private get isDevMode() {
    return !process.env.QINIU_ACCESS_KEY || !process.env.QINIU_SECRET_KEY;
  }

  /**
   * Normalize a phone number: strip spaces/dashes and a leading +86 / 86 prefix
   * so "+86 138 0000 0000" and "8613800000000" both reduce to "13800000000".
   */
  private normalizePhone(phone: string): string {
    return String(phone ?? '')
      .replace(/[\s-]/g, '')
      .replace(/^\+?86/, '');
  }

  /**
   * Send a verification code to the given phone.
   * Implements: rate limiting (60s cooldown, 5/day), expiry (5min), replay
   * protection (1 pending per phone).
   */
  async sendCode(phone: string, requestIp?: string): Promise<void> {
    phone = this.normalizePhone(phone);
    if (!/^1\d{10}$/.test(phone)) throw new BadRequestException('INVALID_PHONE');
    if (process.env.NODE_ENV === 'production' && this.isDevMode) {
      throw new ServiceUnavailableException('SMS_PROVIDER_NOT_CONFIGURED');
    }

    // Replay protection: check for existing pending code within cooldown
    const recent = await this.prisma.smsCode?.findFirst({
      where: { phone, status: 'PENDING', createdAt: { gt: new Date(Date.now() - RESEND_COOLDOWN_MS) } },
      orderBy: { createdAt: 'desc' },
    });
    if (recent) throw new ConflictException('SMS_COOLDOWN_ACTIVE');

    // Daily rate limit
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const todayCount = await this.prisma.smsCode?.count({
      where: { phone, createdAt: { gte: dayStart } },
    });
    if ((todayCount ?? 0) >= DAILY_LIMIT) throw new ConflictException('SMS_DAILY_LIMIT_EXCEEDED');

    // Expire any previous pending codes for this phone (replay protection)
    if (this.prisma.smsCode?.updateMany) {
      await this.prisma.smsCode.updateMany({
        where: { phone, status: 'PENDING' },
        data: { status: 'EXPIRED' },
      });
    }

    const code = this.generateCode();
    const expiresAt = new Date(Date.now() + CODE_TTL_MS);

    await this.prisma.smsCode.create({
      data: { phone, code, status: 'PENDING', requestIp: requestIp ?? null, expiresAt },
    });

    if (this.isDevMode) {
      // Dev mode: log the code instead of sending SMS
      console.log(`[DEV SMS] phone=${phone} code=${code}`);
      return;
    }

    await this.sendViaQiniu(phone, code);
  }

  /**
   * Verify a code for the given phone.
   * Returns true if valid, throws on invalid/expired/too many attempts.
   */
  async verifyCode(phone: string, code: string): Promise<boolean> {
    phone = this.normalizePhone(phone);
    if (!/^1\d{10}$/.test(phone)) throw new BadRequestException('INVALID_PHONE');
    if (!/^\d{6}$/.test(code)) throw new BadRequestException('INVALID_CODE_FORMAT');

    const record = await this.prisma.smsCode?.findFirst({
      where: { phone, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });
    if (!record) throw new ConflictException('NO_PENDING_CODE');
    if (Date.now() >= record.expiresAt.getTime()) {
      if (this.prisma.smsCode?.update) {
        await this.prisma.smsCode.update({ where: { id: record.id }, data: { status: 'EXPIRED' } });
      }
      throw new ConflictException('CODE_EXPIRED');
    }

    const newAttemptCount = (record.attemptCount ?? 0) + 1;
    if (newAttemptCount > MAX_ATTEMPTS) {
      if (this.prisma.smsCode?.update) {
        await this.prisma.smsCode.update({ where: { id: record.id }, data: { status: 'EXPIRED' } });
      }
      throw new ConflictException('MAX_ATTEMPTS_EXCEEDED');
    }

    if (!this.timingSafeCodeEquals(record.code, code)) {
      if (this.prisma.smsCode?.update) {
        await this.prisma.smsCode.update({
          where: { id: record.id },
          data: { attemptCount: newAttemptCount },
        });
      }
      throw new ConflictException('INVALID_VERIFICATION_CODE');
    }

    // Mark as consumed (replay protection)
    if (this.prisma.smsCode?.update) {
      await this.prisma.smsCode.update({
        where: { id: record.id },
        data: { status: 'VERIFIED', consumedAt: new Date() },
      });
    }
    return true;
  }

  private generateCode(): string {
    // crypto.randomInt is cryptographically stronger than Math.random and
    // avoids the modulo bias of floor(random() * N).
    return String(crypto.randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, '0');
  }

  /**
   * Constant-time comparison of the stored code and the user-supplied code to
   * avoid timing side-channels. Both inputs are guaranteed to be 6 ASCII digits
   * at this point (validated above), so the length guard only prevents a
   * thrown error from timingSafeEqual.
   */
  private timingSafeCodeEquals(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  }

  /**
   * Send SMS via Qiniu Cloud SMS API.
   * Uses HMAC-SHA1 signature as per Qiniu's authentication scheme.
   */
  private async sendViaQiniu(phone: string, code: string): Promise<void> {
    const accessKey = process.env.QINIU_ACCESS_KEY!;
    const secretKey = process.env.QINIU_SECRET_KEY!;
    const templateId = process.env.QINIU_SMS_TEMPLATE_ID!;
    const host = 'sms.qiniuapi.com';
    const path = '/v1/template';
    const url = `https://${host}${path}`;
    const body = JSON.stringify({
      template_id: templateId,
      mobiles: [`+86${phone}`],
      parameters: { code },
    });

    const xQiniuDate = new Date().toUTCString();
    const contentType = 'application/json';
    const signingString = `POST ${path}\n${contentType}\n${xQiniuDate}\n`;
    const sign = crypto
      .createHmac('sha1', secretKey)
      .update(signingString)
      .digest('base64');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': contentType,
        'Authorization': `QBox ${accessKey}:${sign}`,
        'X-Qiniu-Date': xQiniuDate,
      },
      body,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      console.error(`[Qiniu SMS] phone=${phone} status=${response.status} body=${text}`);
      throw new ConflictException('SMS_SEND_FAILED');
    }
  }
}
