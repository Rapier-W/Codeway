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
import { OBJECT_STORAGE_PROVIDER } from '../src/storage/object-storage.provider';
import { InMemoryObjectStorageProvider } from '../src/storage/in-memory-object-storage.provider';

// Nest + Prisma 在 Windows 本机首次启动可能超过 Jest 默认 5 秒。
jest.setTimeout(60_000);

const creatorId = '11111111-1111-4111-8111-111111111111';
const memberId = '22222222-2222-4222-8222-222222222222';
const outsiderId = '33333333-3333-4333-8333-333333333333';
const runId = Date.now().toString(36);
const idempotencyKey = (suffix: string) => `pg-${runId}-${suffix}`;

describe('PostgreSQL HTTP business closure (real database)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tripId: string;
  let fareOrderId: string;
  const storage = new InMemoryObjectStorageProvider();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(OBJECT_STORAGE_PROVIDER).useValue(storage).compile();
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
    const first = await request(app.getHttpServer()).post('/api/trips').set('x-user-id', creatorId).set('Idempotency-Key', idempotencyKey('create-trip')).send(body).expect(201);
    const retried = await request(app.getHttpServer()).post('/api/trips').set('x-user-id', creatorId).set('Idempotency-Key', idempotencyKey('create-trip')).send(body).expect(201);
    expect(retried.body.id).toBe(first.body.id);
    tripId = first.body.id;
    await request(app.getHttpServer()).post(`/api/trips/${tripId}/join`).set('x-user-id', memberId).set('Idempotency-Key', idempotencyKey('join-trip')).send({ memberCount: 1 }).expect(201);
    const published = await request(app.getHttpServer()).get('/api/trips/mine?role=published').set('x-user-id', creatorId).expect(200);
    expect(published.body).toEqual(expect.arrayContaining([expect.objectContaining({ id: tripId, activeMemberCount: 2, role: 'published' })]));
    const joined = await request(app.getHttpServer()).get('/api/trips/mine?role=joined').set('x-user-id', memberId).expect(200);
    expect(joined.body).toEqual(expect.arrayContaining([expect.objectContaining({ id: tripId, activeMemberCount: 2, role: 'joined' })]));
    expect(joined.body).not.toEqual(expect.arrayContaining([expect.objectContaining({ role: 'published' })]));
  });

  it('rejects an unverified user from joining before any trip membership is created', async () => {
    await prisma.user.update({ where: { id: outsiderId }, data: { phoneVerified: false } });
    await request(app.getHttpServer()).post(`/api/trips/${tripId}/join`).set('x-user-id', outsiderId)
      .set('Idempotency-Key', idempotencyKey('join-unverified')).send({ memberCount: 1 }).expect(403);
    await expect(prisma.tripMember.findUnique({ where: { tripId_userId: { tripId, userId: outsiderId } } })).resolves.toBeNull();
    await prisma.user.update({ where: { id: outsiderId }, data: { phoneVerified: true } });
  });

  it('opens ride assistance only for the creator, validates the platform, and preserves the adapter result on retry', async () => {
    await prisma.trip.update({ where: { id: tripId }, data: { status: 'FORMED' } });

    await request(app.getHttpServer()).post(`/api/trips/${tripId}/ride/open`).set('x-user-id', memberId)
      .set('Idempotency-Key', idempotencyKey('ride-member')).send({ platform: 'manual' }).expect(403);
    await request(app.getHttpServer()).post(`/api/trips/${tripId}/ride/open`).set('x-user-id', creatorId)
      .set('Idempotency-Key', idempotencyKey('ride-invalid')).send({ platform: 'unknown' }).expect(400);

    const first = await request(app.getHttpServer()).post(`/api/trips/${tripId}/ride/open`).set('x-user-id', creatorId)
      .set('Idempotency-Key', idempotencyKey('ride-amap')).send({ platform: 'amap' }).expect(201);
    const retried = await request(app.getHttpServer()).post(`/api/trips/${tripId}/ride/open`).set('x-user-id', creatorId)
      .set('Idempotency-Key', idempotencyKey('ride-amap')).send({ platform: 'amap' }).expect(201);

    expect(first.body.launch).toEqual(expect.objectContaining({ platform: 'amap', fallbackLevel: 'copy-route', copyRouteText: expect.any(String) }));
    expect(retried.body.launch).toEqual(first.body.launch);
    await expect(prisma.trip.findUniqueOrThrow({ where: { id: tripId } })).resolves.toMatchObject({ status: 'WAITING_RIDE' });

    await prisma.trip.update({ where: { id: tripId }, data: { status: 'RIDE_BOOKED' } });
    await request(app.getHttpServer()).post(`/api/trips/${tripId}/ride/open`).set('x-user-id', creatorId)
      .set('Idempotency-Key', idempotencyKey('ride-booked')).send({ platform: 'manual' }).expect(409);
  });

  it('recovers both concurrent open-ride requests with the same idempotency key', async () => {
    await prisma.trip.update({ where: { id: tripId }, data: { status: 'FORMED' } });
    const key = idempotencyKey('ride-concurrent-duplicate');
    const [first, second] = await Promise.all([
      request(app.getHttpServer()).post(`/api/trips/${tripId}/ride/open`).set('x-user-id', creatorId)
        .set('Idempotency-Key', key).send({ platform: 'manual' }),
      request(app.getHttpServer()).post(`/api/trips/${tripId}/ride/open`).set('x-user-id', creatorId)
        .set('Idempotency-Key', key).send({ platform: 'manual' }),
    ]);

    expect([first.status, second.status]).toEqual([201, 201]);
    expect(first.body.id).toBe(second.body.id);
    expect([first.body.duplicate, second.body.duplicate]).toEqual(expect.arrayContaining([false, true]));
  });

  it('never lets a successful vehicle update be rolled back by a concurrent ride open', async () => {
    await prisma.trip.update({ where: { id: tripId }, data: { status: 'FORMED' } });
    const [ride, vehicle] = await Promise.all([
      request(app.getHttpServer()).post(`/api/trips/${tripId}/ride/open`).set('x-user-id', creatorId)
        .set('Idempotency-Key', idempotencyKey('ride-concurrent-vehicle')).send({ platform: 'manual' }),
      request(app.getHttpServer()).post(`/api/trips/${tripId}/vehicle`).set('x-user-id', creatorId)
        .set('Idempotency-Key', idempotencyKey('vehicle-concurrent-ride')).send({ plate: '浙A88888' }),
    ]);

    expect(vehicle.status).toBe(201);
    expect([201, 409]).toContain(ride.status);
    await expect(prisma.trip.findUniqueOrThrow({ where: { id: tripId } })).resolves.toMatchObject({ status: 'RIDE_BOOKED' });
  });

  it('enforces member-only chat and client-key retry', async () => {
    const first = await request(app.getHttpServer()).post(`/api/trips/${tripId}/messages`).set('x-user-id', memberId).set('Idempotency-Key', idempotencyKey('chat')).send({ text: 'E2E 消息' }).expect(201);
    const retried = await request(app.getHttpServer()).post(`/api/trips/${tripId}/messages`).set('x-user-id', memberId).set('Idempotency-Key', idempotencyKey('chat')).send({ text: 'E2E 消息' }).expect(201);
    expect(retried.body.id).toBe(first.body.id);
    await request(app.getHttpServer()).get(`/api/trips/${tripId}/messages`).set('x-user-id', outsiderId).expect(403);
    await request(app.getHttpServer()).post(`/api/trips/${tripId}/messages`).set('x-user-id', memberId).set('Idempotency-Key', idempotencyKey('chat-space')).send({ text: '   ' }).expect(400);
  });

  it('keeps vehicle, ride and emergency contact writes idempotent', async () => {
    await prisma.trip.update({ where: { id: tripId }, data: { status: 'FORMED' } });
    const ride1 = await request(app.getHttpServer()).post(`/api/trips/${tripId}/ride/open`).set('x-user-id', creatorId).set('Idempotency-Key', idempotencyKey('ride')).send({ platform: 'manual' }).expect(201);
    const ride2 = await request(app.getHttpServer()).post(`/api/trips/${tripId}/ride/open`).set('x-user-id', creatorId).set('Idempotency-Key', idempotencyKey('ride')).send({ platform: 'manual' }).expect(201);
    expect(ride2.body.id).toBe(ride1.body.id);
    const vehicle1 = await request(app.getHttpServer()).post(`/api/trips/${tripId}/vehicle`).set('x-user-id', creatorId).set('Idempotency-Key', idempotencyKey('vehicle')).send({ plate: '浙A12345' }).expect(201);
    const vehicle2 = await request(app.getHttpServer()).post(`/api/trips/${tripId}/vehicle`).set('x-user-id', creatorId).set('Idempotency-Key', idempotencyKey('vehicle')).send({ plate: '浙A12345' }).expect(201);
    expect(vehicle2.body.id).toBe(vehicle1.body.id);
    const contact1 = await request(app.getHttpServer()).post('/api/emergency-contacts').set('x-user-id', creatorId).set('Idempotency-Key', idempotencyKey('contact')).send({ name: '家人', phone: '13900000004' }).expect(201);
    const contact2 = await request(app.getHttpServer()).post('/api/emergency-contacts').set('x-user-id', creatorId).set('Idempotency-Key', idempotencyKey('contact')).send({ name: '家人', phone: '13900000004' }).expect(201);
    expect(contact2.body.id).toBe(contact1.body.id);
  });

  it('records SOS only for a member and never persists coordinates', async () => {
    const response = await request(app.getHttpServer()).post(`/api/trips/${tripId}/sos`).set('x-user-id', memberId).set('Idempotency-Key', idempotencyKey('sos')).send({ note: 'E2E SOS', latitude: 30.1, longitude: 120.2 }).expect(201);
    const event = await prisma.sosEvent.findUniqueOrThrow({ where: { id: response.body.id } });
    expect(event.latitude).toBeNull();
    expect(event.longitude).toBeNull();
    await request(app.getHttpServer()).post(`/api/trips/${tripId}/sos`).set('x-user-id', outsiderId).set('Idempotency-Key', idempotencyKey('sos-outsider')).send({}).expect(403);
  });

  it('keeps order details member-only and drives the fee confirmation into review', async () => {
    await prisma.trip.update({ where: { id: tripId }, data: { status: 'RIDE_BOOKED' } });
    await request(app.getHttpServer()).post(`/api/trips/${tripId}/fare-screenshot-uploads`).set('x-user-id', creatorId)
      .send({ mimeType: 'image/png', sizeBytes: 100 }).expect(400);
    await request(app.getHttpServer()).post(`/api/trips/${tripId}/fare-screenshot-uploads`).set('x-user-id', creatorId)
      .set('Idempotency-Key', 'not valid!').send({ mimeType: 'image/png', sizeBytes: 100 }).expect(400);
    const intent = await request(app.getHttpServer()).post(`/api/trips/${tripId}/fare-screenshot-uploads`).set('x-user-id', creatorId)
      .set('Idempotency-Key', idempotencyKey('fare-upload')).send({ mimeType: 'image/png', sizeBytes: 100 }).expect(201);
    await storage.putForTest({ objectKey: intent.body.objectKey, uploadUrl: intent.body.uploadUrl, uploadToken: intent.body.uploadToken, expiresAt: new Date(intent.body.expiresAt) }, Buffer.alloc(100), 'image/png');
    const created = await request(app.getHttpServer()).post(`/api/trips/${tripId}/fare-order`).set('x-user-id', creatorId)
      .send({ screenshotUploadId: intent.body.uploadId, actualTotalFareCents: 1200 }).expect(201);
    fareOrderId = created.body.fareOrder.id;
    await request(app.getHttpServer()).get(`/api/fare-orders/${fareOrderId}`).set('x-user-id', outsiderId).expect(403);
    await request(app.getHttpServer()).get(`/api/fare-orders/${fareOrderId}/screenshot`).set('x-user-id', outsiderId).expect(403);
    const screenshot = await request(app.getHttpServer()).get(`/api/fare-orders/${fareOrderId}/screenshot`).set('x-user-id', memberId).expect(200);
    expect(screenshot.body).toEqual(expect.objectContaining({ url: expect.any(String), expiresAt: expect.any(String) }));
    await request(app.getHttpServer()).post(`/api/fare-orders/${fareOrderId}/confirm`).set('x-user-id', creatorId).expect(201);
    const confirmed = await request(app.getHttpServer()).post(`/api/fare-orders/${fareOrderId}/confirm`).set('x-user-id', memberId).expect(201);
    expect(confirmed.body.fareOrder.status).toBe('CONFIRMED');
    await expect(prisma.trip.findUniqueOrThrow({ where: { id: tripId } })).resolves.toMatchObject({ status: 'PENDING_REVIEW' });
  });

  it('uses the fare order ID for a member-only, idempotent review', async () => {
    const payload = { targetUserId: creatorId, punctuality: 5, communication: 4, safety: 5, politeness: 4 };
    const first = await request(app.getHttpServer()).post(`/api/fare-orders/${fareOrderId}/review`).set('x-user-id', memberId).set('Idempotency-Key', idempotencyKey('review')).send(payload).expect(201);
    const retried = await request(app.getHttpServer()).post(`/api/fare-orders/${fareOrderId}/review`).set('x-user-id', memberId).set('Idempotency-Key', idempotencyKey('review')).send(payload).expect(201);
    expect(retried.body.review.id).toBe(first.body.review.id);
    await request(app.getHttpServer()).post(`/api/fare-orders/${fareOrderId}/review`).set('x-user-id', creatorId).set('Idempotency-Key', idempotencyKey('self-review')).send({ ...payload, targetUserId: creatorId }).expect(403);
  });
});
