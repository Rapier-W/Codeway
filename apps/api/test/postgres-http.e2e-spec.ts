/** Real PostgreSQL HTTP closure. Set E2E_DATABASE_URL, migrate first, then run test:e2e:postgres. */
const databaseUrl = process.env.E2E_DATABASE_URL;
if (!databaseUrl) throw new Error('E2E_DATABASE_URL is required for real PostgreSQL HTTP E2E');
process.env.DATABASE_URL = databaseUrl;

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureHttpApp } from '../src/http-app';
import { PrismaService } from '../src/prisma.service';

// Nest + Prisma 在 Windows 本机首次启动可能超过 Jest 默认 5 秒。
jest.setTimeout(60_000);

const creatorId = '11111111-1111-4111-8111-111111111111';
const memberId = '22222222-2222-4222-8222-222222222222';
const outsiderId = '33333333-3333-4333-8333-333333333333';

describe('PostgreSQL HTTP business closure (real database)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tripId: string;
  let fareOrderId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureHttpApp(moduleRef.createNestApplication());
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.$connect();
    await prisma.review.deleteMany({ where: { reviewerId: { in: [creatorId, memberId, outsiderId] } } });
    await prisma.chatMessage.deleteMany({ where: { senderId: { in: [creatorId, memberId, outsiderId] } } });
    await prisma.sosEvent.deleteMany({ where: { userId: { in: [creatorId, memberId, outsiderId] } } });
    await prisma.user.upsert({ where: { id: creatorId }, update: { phoneVerified: true }, create: { id: creatorId, phone: '13900000001', phoneVerified: true } });
    await prisma.user.upsert({ where: { id: memberId }, update: { phoneVerified: true }, create: { id: memberId, phone: '13900000002', phoneVerified: true } });
    await prisma.user.upsert({ where: { id: outsiderId }, update: { phoneVerified: true }, create: { id: outsiderId, phone: '13900000003', phoneVerified: true } });
  });

  afterAll(async () => { await prisma?.$disconnect(); await app?.close(); });

  it('creates a trip idempotently and permits a member join', async () => {
    const body = { origin: 'E2E 起点', destination: 'E2E 终点', departTime: new Date(Date.now() + 3_600_000).toISOString(), capacity: 3 };
    const first = await request(app.getHttpServer()).post('/api/trips').set('x-user-id', creatorId).set('Idempotency-Key', 'pg-create-trip').send(body).expect(201);
    const retried = await request(app.getHttpServer()).post('/api/trips').set('x-user-id', creatorId).set('Idempotency-Key', 'pg-create-trip').send(body).expect(201);
    expect(retried.body.id).toBe(first.body.id);
    tripId = first.body.id;
    await request(app.getHttpServer()).post(`/api/trips/${tripId}/join`).set('x-user-id', memberId).set('Idempotency-Key', 'pg-join-trip').send({ memberCount: 1 }).expect(201);
    const published = await request(app.getHttpServer()).get('/api/trips/mine?role=published').set('x-user-id', creatorId).expect(200);
    expect(published.body).toEqual(expect.arrayContaining([expect.objectContaining({ id: tripId, activeMemberCount: 2, role: 'published' })]));
    const joined = await request(app.getHttpServer()).get('/api/trips/mine?role=joined').set('x-user-id', memberId).expect(200);
    expect(joined.body).toEqual(expect.arrayContaining([expect.objectContaining({ id: tripId, activeMemberCount: 2, role: 'joined' })]));
  });

  it('enforces member-only chat and client-key retry', async () => {
    const first = await request(app.getHttpServer()).post(`/api/trips/${tripId}/messages`).set('x-user-id', memberId).set('Idempotency-Key', 'pg-chat-key').send({ text: 'E2E 消息' }).expect(201);
    const retried = await request(app.getHttpServer()).post(`/api/trips/${tripId}/messages`).set('x-user-id', memberId).set('Idempotency-Key', 'pg-chat-key').send({ text: 'E2E 消息' }).expect(201);
    expect(retried.body.id).toBe(first.body.id);
    await request(app.getHttpServer()).get(`/api/trips/${tripId}/messages`).set('x-user-id', outsiderId).expect(403);
  });

  it('records SOS only for a member and never persists coordinates', async () => {
    const response = await request(app.getHttpServer()).post(`/api/trips/${tripId}/sos`).set('x-user-id', memberId).set('Idempotency-Key', 'pg-sos-key').send({ note: 'E2E SOS', latitude: 30.1, longitude: 120.2 }).expect(201);
    const event = await prisma.sosEvent.findUniqueOrThrow({ where: { id: response.body.id } });
    expect(event.latitude).toBeNull();
    expect(event.longitude).toBeNull();
    await request(app.getHttpServer()).post(`/api/trips/${tripId}/sos`).set('x-user-id', outsiderId).set('Idempotency-Key', 'pg-sos-outsider').send({}).expect(403);
  });

  it('keeps order details member-only and drives the fee confirmation into review', async () => {
    await prisma.trip.update({ where: { id: tripId }, data: { status: 'RIDE_BOOKED' } });
    const created = await request(app.getHttpServer()).post(`/api/trips/${tripId}/fare-order`).set('x-user-id', creatorId).send({ screenshotKey: 'e2e/order.png', mimeType: 'image/png', sizeBytes: 100, actualTotalFareCents: 1200 }).expect(201);
    fareOrderId = created.body.fareOrder.id;
    await request(app.getHttpServer()).get(`/api/fare-orders/${fareOrderId}`).set('x-user-id', outsiderId).expect(403);
    await request(app.getHttpServer()).post(`/api/fare-orders/${fareOrderId}/confirm`).set('x-user-id', creatorId).expect(201);
    const confirmed = await request(app.getHttpServer()).post(`/api/fare-orders/${fareOrderId}/confirm`).set('x-user-id', memberId).expect(201);
    expect(confirmed.body.fareOrder.status).toBe('CONFIRMED');
    await expect(prisma.trip.findUniqueOrThrow({ where: { id: tripId } })).resolves.toMatchObject({ status: 'PENDING_REVIEW' });
  });

  it('uses the fare order ID for a member-only, idempotent review', async () => {
    const payload = { targetUserId: creatorId, punctuality: 5, communication: 4, safety: 5, politeness: 4 };
    const first = await request(app.getHttpServer()).post(`/api/fare-orders/${fareOrderId}/review`).set('x-user-id', memberId).set('Idempotency-Key', 'pg-review-key').send(payload).expect(201);
    const retried = await request(app.getHttpServer()).post(`/api/fare-orders/${fareOrderId}/review`).set('x-user-id', memberId).set('Idempotency-Key', 'pg-review-key').send(payload).expect(201);
    expect(retried.body.review.id).toBe(first.body.review.id);
    await request(app.getHttpServer()).post(`/api/fare-orders/${fareOrderId}/review`).set('x-user-id', creatorId).set('Idempotency-Key', 'pg-self-review').send({ ...payload, targetUserId: creatorId }).expect(403);
  });
});
