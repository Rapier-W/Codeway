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
import { cleanupTripFixtures } from './e2e-fixture-cleanup';

jest.setTimeout(60_000);

const runId = Date.now().toString(36);
const phone = `139${String(Date.now()).slice(-8)}`;
const userId = `dev-${phone}`;
const fixturePrefix = `AUTH_E2E_${runId}_`;

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
  });

  afterAll(async () => {
    try {
      if (prisma) {
        const fixtures = await prisma.trip.findMany({ where: { origin: { startsWith: fixturePrefix } }, select: { id: true } });
        await cleanupTripFixtures(prisma, fixtures.map(item => item.id));
        await prisma.session.deleteMany({ where: { userId } });
        await prisma.smsCode.deleteMany({ where: { phone } });
        await prisma.tripMember.deleteMany({ where: { userId } });
        await prisma.user.deleteMany({ where: { id: userId } });
      }
    } finally {
      await prisma?.$disconnect();
      await app?.close();
    }
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
      .send({ origin: `${fixturePrefix}认证起点`, destination: `${fixturePrefix}认证终点`, departTime: new Date(Date.now() + 3_600_000).toISOString(), capacity: 3 })
      .expect(201);
    expect(response.body.creatorId).toBe(userId);
  });

  it('invalidates protected access after logout', async () => {
    await request(app.getHttpServer()).post('/api/auth/logout').set('Cookie', sessionCookie).expect(204);
    await request(app.getHttpServer()).post('/api/trips').set('Cookie', sessionCookie).send({ origin: 'A', destination: 'B', departTime: new Date(Date.now() + 3_600_000).toISOString(), capacity: 3 }).expect(401);
  });
});
