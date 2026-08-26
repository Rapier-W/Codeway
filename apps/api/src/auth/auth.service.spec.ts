import { ConflictException, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { AuthService } from './auth.service';
import { SmsService } from './sms.service';

describe('AuthService', () => {
  const prisma: any = {
    user: { upsert: jest.fn(), findUnique: jest.fn() },
    session: { create: jest.fn(), findUnique: jest.fn(), delete: jest.fn(), deleteMany: jest.fn() },
  };
  const smsService: any = {
    sendCode: jest.fn(),
    verifyCode: jest.fn(),
  };
  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthService(prisma, smsService as any);
  });

  it('requests a code via SmsService', async () => {
    smsService.sendCode.mockResolvedValue(undefined);
    await service.requestCode('13800000000', '127.0.0.1');
    expect(smsService.sendCode).toHaveBeenCalledWith('13800000000', '127.0.0.1');
  });

  it('verifies code, creates user and session, returns user with token', async () => {
    smsService.verifyCode.mockResolvedValue(true);
    prisma.user.upsert.mockResolvedValue({ id: 'dev-13800000000', phone: '13800000000', phoneVerified: true, nickname: '用户0000' });
    prisma.session.create.mockResolvedValue({ id: 's1', token: 'abc123' });

    const result = await service.verifyCode('13800000000', '123456', { ip: '127.0.0.1', userAgent: 'test' });

    expect(result.user.id).toBe('dev-13800000000');
    expect(result.token).toBeTruthy();
    expect(result.cookieOptions.httpOnly).toBe(true);
    expect(prisma.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'dev-13800000000' }, create: expect.objectContaining({ phoneVerified: true }) }),
    );
    expect(prisma.session.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'dev-13800000000' }) }),
    );
  });

  it('returns null for a non-existent session token', async () => {
    prisma.session.findUnique.mockResolvedValue(null);
    const result = await service.getUserByToken('invalid-token');
    expect(result).toBeNull();
  });

  it('returns null for an expired session and cleans it up', async () => {
    prisma.session.findUnique.mockResolvedValue({
      id: 's1', token: 'old-token', expiresAt: new Date(Date.now() - 1000), user: { id: 'u1' },
    });
    prisma.session.delete.mockResolvedValue({});
    const result = await service.getUserByToken('old-token');
    expect(result).toBeNull();
    expect(prisma.session.delete).toHaveBeenCalledWith({ where: { id: 's1' } });
  });

  it('returns the user for a valid session token', async () => {
    prisma.session.findUnique.mockResolvedValue({
      id: 's1', token: 'valid-token', expiresAt: new Date(Date.now() + 3600000),
      user: { id: 'u1', phoneVerified: true, nickname: 'test' },
    });
    const result = await service.getUserByToken('valid-token');
    expect(result).toEqual({ id: 'u1', phoneVerified: true, nickname: 'test' });
  });

  it('returns a fallback user in mock/test environments without user.findUnique', async () => {
    const mockPrisma: any = { user: {}, session: {} };
    const mockService = new AuthService(mockPrisma, smsService as any);
    const result = await mockService.getUserById('test-user');
    expect(result).toEqual({ id: 'test-user', phoneVerified: true });
  });

  it('throws NotFoundException when user does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.getUserById('nonexistent')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('logs out by deleting the session', async () => {
    prisma.session.deleteMany.mockResolvedValue({ count: 1 });
    await service.logout('valid-token');
    // Session tokens are stored hashed; logout hashes the raw cookie token
    // before querying, so the query uses the SHA-256 digest, not the raw value.
    const expectedHash = crypto.createHash('sha256').update('valid-token').digest('hex');
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { token: expectedHash } });
  });

  it('does not throw when logging out without a token', async () => {
    await expect(service.logout('')).resolves.toBeUndefined();
    expect(prisma.session.deleteMany).not.toHaveBeenCalled();
  });

  it('exposes the cookie name', () => {
    expect(service.cookieName).toBe('tongluxing_session');
  });
});
