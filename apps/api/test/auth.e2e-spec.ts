import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';
import { configureHttpApp } from '../src/http-app';

describe('Auth API (e2e)', () => {
  let app: INestApplication;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      user: {
        upsert: jest.fn().mockResolvedValue({ id: 'dev-13800000000', phone: '13800000000', phoneVerified: true, nickname: '用户0000' }),
        findUnique: jest.fn().mockResolvedValue({ id: 'dev-13800000000', phone: '13800000000', phoneVerified: true, nickname: '用户0000' }),
      },
      session: {
        create: jest.fn().mockResolvedValue({ id: 's1', token: 'test-session-token' }),
        findUnique: jest.fn().mockResolvedValue(null),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      smsCode: {
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue({ id: 'c1', code: '123456', status: 'PENDING' }),
        update: jest.fn().mockResolvedValue({ status: 'VERIFIED' }),
      },
      trip: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue({ id: 'test-id', origin: 'A', destination: 'B', members: [], creator: { creditScore: 100, phoneVerified: true, studentVerified: true } }),
      },
      $transaction: jest.fn((fn: any) => fn({
        user: { findUnique: jest.fn().mockResolvedValue({ id: 'dev-13800000000', phoneVerified: true }) },
      })),
    };

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();
    app = configureHttpApp(moduleRef.createNestApplication());
    app.use(cookieParser());
    await app.init();
  });

  afterEach(async () => { if (app) await app.close(); });

  it('sends a verification code (dev mode) and returns 204', async () => {
    await request(app.getHttpServer()).post('/api/auth/request-code').send({ phone: '13800000000' }).expect(204);
  });

  it('verifies the code, returns the user, and sets an HttpOnly cookie', async () => {
    prismaMock.smsCode.findFirst.mockResolvedValueOnce({
      id: 'c1', phone: '13800000000', code: '123456', status: 'PENDING',
      attemptCount: 0, expiresAt: new Date(Date.now() + 60_000),
    });

    const response = await request(app.getHttpServer())
      .post('/api/auth/verify-code')
      .send({ phone: '13800000000', code: '123456' })
      .expect(201);

    expect(response.body).toMatchObject({ id: 'dev-13800000000', phoneVerified: true });
    const setCookie = response.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    expect(setCookie[0]).toContain('tongluxing_session=');
    expect(setCookie[0]).toContain('HttpOnly');
  });

  it('returns 401 for protected routes without authentication', async () => {
    await request(app.getHttpServer())
      .post('/api/trips')
      .send({ origin: 'A', destination: 'B', departTime: new Date(Date.now() + 3600000).toISOString(), capacity: 3 })
      .expect(401);
  });

  it('allows access to public routes (trip list) without authentication', async () => {
    await request(app.getHttpServer()).get('/api/trips').expect(200);
  });

  it('allows access to public routes (trip detail) without authentication', async () => {
    await request(app.getHttpServer()).get('/api/trips/test-id').expect(200);
  });

  it('returns 401 when the session cookie maps to an expired session', async () => {
    prismaMock.session.findUnique.mockResolvedValueOnce({
      id: 's-old',
      token: 'expired-hash',
      expiresAt: new Date(Date.now() - 1000),
      user: { id: 'u1', phoneVerified: true, nickname: 'x' },
    });
    await request(app.getHttpServer())
      .post('/api/trips')
      .set('Cookie', 'tongluxing_session=expired-raw-token')
      .send({ origin: 'A', destination: 'B', departTime: new Date(Date.now() + 3600000).toISOString(), capacity: 3 })
      .expect(401);
  });

  it('sets HttpOnly + SameSite=Lax and omits Secure outside production', async () => {
    prismaMock.smsCode.findFirst.mockResolvedValueOnce({
      id: 'c1', phone: '13800000000', code: '123456', status: 'PENDING',
      attemptCount: 0, expiresAt: new Date(Date.now() + 60_000),
    });

    const response = await request(app.getHttpServer())
      .post('/api/auth/verify-code')
      .send({ phone: '13800000000', code: '123456' })
      .expect(201);

    const setCookie = response.headers['set-cookie'][0];
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    // NODE_ENV is 'test' here, so the Secure flag must NOT be set.
    expect(setCookie).not.toContain('Secure');
  });

  it('returns 429 after exceeding the global rate limit', async () => {
    let saw429 = false;
    for (let i = 0; i < 25 && !saw429; i++) {
      const res = await request(app.getHttpServer()).get('/api/health');
      if (res.status === 429) saw429 = true;
    }
    expect(saw429).toBe(true);
  }, 20000);
});
