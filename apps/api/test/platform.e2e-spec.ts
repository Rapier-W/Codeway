import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';

describe('Platform API (e2e)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaService).useValue({ user: { upsert: jest.fn().mockResolvedValue({ id: 'u1', phoneVerified: true }) }, $transaction: jest.fn((fn: any) => fn({ trip: { findUnique: jest.fn().mockResolvedValue({ id: 't1', creatorId: 'u1', status: 'FORMED' }), update: jest.fn() }, rideRecord: { create: jest.fn().mockResolvedValue({ id: 'r1', mode: 'MANUAL_FALLBACK' }) }, sosEvent: { create: jest.fn().mockResolvedValue({ id: 's1' }) }, emergencyContact: { findMany: jest.fn().mockResolvedValue([]) }, notificationEvent: { create: jest.fn() } })) }).compile();
    app = moduleRef.createNestApplication(); await app.init();
  });
  afterAll(async () => app.close());
  it('exposes auth, ride, fare and SOS routes', async () => {
    await request(app.getHttpServer()).post('/trips/t1/ride/open').set('x-user-id', 'u1').send({ platform: 'GAODE' }).expect(201);
    await request(app.getHttpServer()).post('/trips/t1/sos').set('x-user-id', 'u1').send({ latitude: 0, longitude: 0 }).expect(201);
  });
});
