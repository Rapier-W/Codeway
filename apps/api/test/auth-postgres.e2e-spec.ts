/** Real PostgreSQL authentication closure. Set E2E_DATABASE_URL and migrate first. */
const databaseUrl = process.env.E2E_DATABASE_URL;
if (!databaseUrl) throw new Error('E2E_DATABASE_URL is required for real PostgreSQL auth E2E');
process.env.DATABASE_URL = databaseUrl;

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureHttpApp } from '../src/http-app';
import { PrismaService } from '../src/prisma.service';

jest.setTimeout(60_000);

const phone = '13900000099';
const userId = `dev-${phone}`;

describe('PostgreSQL HTTP authentication closure (real database)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sessionCookie: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureHttpApp(moduleRef.createNestApplication());
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.$connect();
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.smsCode.deleteMany({ where: { phone } });
    await prisma.tripMember.deleteMany({ where: { userId } });
    await prisma.trip.deleteMany({ where: { creatorId: userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  afterAll(async () => {
    await prisma?.session.deleteMany({ where: { userId } });
    await prisma?.smsCode.deleteMany({ where: { phone } });
    await prisma?.tripMember.deleteMany({ where: { userId } });
    await prisma?.trip.deleteMany({ where: { creatorId: userId } });
    await prisma?.user.deleteMany({ where: { id: userId } });
    await prisma?.$disconnect();
    await app?.close();
  });

  it('verifies a seeded code and establishes an HttpOnly session cookie', async () => {
    await prisma.smsCode.create({
      data: { phone, code: '123456', status: 'PENDING', expiresAt: new Date(Date.now() + 60_000) },
    });
    const response = await request(app.getHttpServer()).post('/api/auth/verify-code').send({ phone, code: '123456' }).expect(201);
    expect(response.body).toMatchObject({ id: userId, phoneVerified: true });
    expect(response.headers['set-cookie'][0]).toContain('tongluxing_session=');
    expect(response.headers['set-cookie'][0]).toContain('HttpOnly');
    sessionCookie = response.headers['set-cookie'][0].split(';')[0];
  });

  it('uses the session cookie for protected HTTP requests without x-user-id', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/trips')
      .set('Cookie', sessionCookie)
      .send({ origin: '认证起点', destination: '认证终点', departTime: new Date(Date.now() + 3_600_000).toISOString(), capacity: 3 })
      .expect(201);
    expect(response.body.creatorId).toBe(userId);
  });

  it('invalidates protected access after logout', async () => {
    await request(app.getHttpServer()).post('/api/auth/logout').set('Cookie', sessionCookie).expect(204);
    await request(app.getHttpServer()).post('/api/trips').set('Cookie', sessionCookie).send({ origin: 'A', destination: 'B', departTime: new Date(Date.now() + 3_600_000).toISOString(), capacity: 3 }).expect(401);
  });
});
