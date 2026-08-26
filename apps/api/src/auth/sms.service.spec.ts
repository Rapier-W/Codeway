import { BadRequestException, ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { SmsService } from './sms.service';

describe('SmsService', () => {
  const prisma: any = {
    smsCode: {
      findFirst: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  let service: SmsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SmsService(prisma);
    // Force dev mode (no Qiniu credentials)
    delete process.env.QINIU_ACCESS_KEY;
    delete process.env.QINIU_SECRET_KEY;
  });

  it('rejects an invalid phone number', async () => {
    await expect(service.sendCode('123', '127.0.0.1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects sending within the 60-second cooldown', async () => {
    prisma.smsCode.findFirst.mockResolvedValue({
      id: 'c1', phone: '13800000000', status: 'PENDING',
      createdAt: new Date(Date.now() - 30_000),
    });
    await expect(service.sendCode('13800000000', '127.0.0.1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('fails closed in production when Qiniu credentials are missing', async () => {
    const prior = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      await expect(service.sendCode('13800000000', '127.0.0.1')).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(prisma.smsCode.create).not.toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = prior;
    }
  });

  it('rejects when daily limit is exceeded', async () => {
    prisma.smsCode.findFirst.mockResolvedValue(null); // no recent code
    prisma.smsCode.count.mockResolvedValue(5); // already 5 today
    await expect(service.sendCode('13800000000', '127.0.0.1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('expires previous pending codes and creates a new one in dev mode', async () => {
    prisma.smsCode.findFirst.mockResolvedValue(null);
    prisma.smsCode.count.mockResolvedValue(0);
    prisma.smsCode.updateMany.mockResolvedValue({ count: 1 });
    prisma.smsCode.create.mockResolvedValue({ id: 'c1', code: '123456', status: 'PENDING' });

    await service.sendCode('13800000000', '127.0.0.1');

    expect(prisma.smsCode.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { phone: '13800000000', status: 'PENDING' }, data: { status: 'EXPIRED' } }),
    );
    expect(prisma.smsCode.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ phone: '13800000000', status: 'PENDING' }) }),
    );
  });

  it('verifies a correct code and marks it as consumed', async () => {
    prisma.smsCode.findFirst.mockResolvedValue({
      id: 'c1', phone: '13800000000', code: '123456', status: 'PENDING',
      attemptCount: 0, expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.smsCode.update.mockResolvedValue({ status: 'VERIFIED' });

    const result = await service.verifyCode('13800000000', '123456');
    expect(result).toBe(true);
    expect(prisma.smsCode.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'c1' }, data: { status: 'VERIFIED', consumedAt: expect.any(Date) } }),
    );
  });

  it('rejects an incorrect code and increments attempt count', async () => {
    prisma.smsCode.findFirst.mockResolvedValue({
      id: 'c1', phone: '13800000000', code: '123456', status: 'PENDING',
      attemptCount: 0, expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.smsCode.update.mockResolvedValue({});

    await expect(service.verifyCode('13800000000', '000000')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.smsCode.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'c1' }, data: { attemptCount: 1 } }),
    );
  });

  it('rejects an expired code', async () => {
    prisma.smsCode.findFirst.mockResolvedValue({
      id: 'c1', phone: '13800000000', code: '123456', status: 'PENDING',
      attemptCount: 0, expiresAt: new Date(Date.now() - 1_000),
    });
    prisma.smsCode.update.mockResolvedValue({});

    await expect(service.verifyCode('13800000000', '123456')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.smsCode.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'c1' }, data: { status: 'EXPIRED' } }),
    );
  });

  it('rejects after exceeding max attempts', async () => {
    prisma.smsCode.findFirst.mockResolvedValue({
      id: 'c1', phone: '13800000000', code: '123456', status: 'PENDING',
      attemptCount: 5, expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.smsCode.update.mockResolvedValue({});

    await expect(service.verifyCode('13800000000', '123456')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.smsCode.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'c1' }, data: { status: 'EXPIRED' } }),
    );
  });
});
