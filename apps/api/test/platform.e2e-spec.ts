import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';
import { configureHttpApp } from '../src/http-app';

describe('Platform API (e2e)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaService).useValue({ user: { upsert: jest.fn().mockResolvedValue({ id: 'u1', phoneVerified: true }) }, $transaction: jest.fn((fn: any) => fn({ trip: { findUnique: jest.fn().mockResolvedValue({ id: 't1', creatorId: 'u1', status: 'FORMED' }), update: jest.fn() }, tripMember: { findUnique: jest.fn().mockResolvedValue({ id: 'm1', tripId: 't1', userId: 'u1' }) }, rideRecord: { create: jest.fn().mockResolvedValue({ id: 'r1', mode: 'MANUAL_FALLBACK' }) }, sosEvent: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 's1' }) }, emergencyContact: { findMany: jest.fn().mockResolvedValue([]) }, notificationEvent: { create: jest.fn() } })) }).compile();
    app = configureHttpApp(moduleRef.createNestApplication()); await app.init();
  });
  afterAll(async () => app.close());
  it('exposes auth, ride, fare and SOS routes', async () => {
    await request(app.getHttpServer()).post('/api/auth/phone').set('x-user-id', 'u1').send({ phone: '13800000000' }).expect(201);
    await request(app.getHttpServer()).post('/api/trips/t1/ride/open').set('x-user-id', 'u1').send({ platform: 'GAODE' }).expect(201);
    await request(app.getHttpServer()).post('/api/trips/t1/sos').set('x-user-id', 'u1').set('Idempotency-Key', 'sos-e2e-key').send({ latitude: 0, longitude: 0 }).expect(201);
  });

  it('does not trust the development identity header in production', async () => {
    const prior = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    await request(app.getHttpServer()).post('/api/auth/phone').set('x-user-id', 'u1').send({ phone: '13800000000' }).expect(403);
    process.env.NODE_ENV = prior;
  });
});
