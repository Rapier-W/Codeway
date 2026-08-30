/** Real PostgreSQL HTTP closure. Set E2E_DATABASE_URL, migrate first, then run test:e2e:postgres. */
const databaseUrl = process.env.E2E_DATABASE_URL;
if (!databaseUrl) throw new Error('E2E_DATABASE_URL is required for real PostgreSQL HTTP E2E');
process.env.DATABASE_URL = databaseUrl;

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureHttpApp } from '../src/http-app';
import { PrismaService } from '../src/prisma.service';
import { PlatformService } from '../src/platform/platform.service';
import { OBJECT_STORAGE_PROVIDER } from '../src/storage/object-storage.provider';
import { InMemoryObjectStorageProvider } from '../src/storage/in-memory-object-storage.provider';
import { FareService } from '../src/fare/fare.service';
import { cleanupTripFixtures } from './e2e-fixture-cleanup';

// Nest + Prisma 在 Windows 本机首次启动可能超过 Jest 默认 5 秒。
jest.setTimeout(60_000);

const creatorId = '11111111-1111-4111-8111-111111111111';
const memberId = '22222222-2222-4222-8222-222222222222';
const outsiderId = '33333333-3333-4333-8333-333333333333';
const runId = Date.now().toString(36);
const idempotencyKey = (suffix: string) => `pg-${runId}-${suffix}`;
const fixturePrefix = `E2E_RUN_${runId}_`;

describe('PostgreSQL HTTP business closure (real database)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let platform: PlatformService;
  let throttlerStorage: any;
  let fareService: FareService;
  let tripId: string;
  let fareOrderId: string;
  const storage = new InMemoryObjectStorageProvider();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(OBJECT_STORAGE_PROVIDER).useValue(storage).compile();
    app = configureHttpApp(moduleRef.createNestApplication());
    await app.init();
    prisma = app.get(PrismaService);
    platform = app.get(PlatformService);
    fareService = app.get(FareService);
    throttlerStorage = app.get(ThrottlerStorage);
    await prisma.$connect();
    await prisma.review.deleteMany({ where: { reviewerId: { in: [creatorId, memberId, outsiderId] } } });
    await prisma.chatMessage.deleteMany({ where: { senderId: { in: [creatorId, memberId, outsiderId] } } });
    await prisma.sosEvent.deleteMany({ where: { userId: { in: [creatorId, memberId, outsiderId] } } });
    await prisma.user.upsert({ where: { id: creatorId }, update: { phoneVerified: true }, create: { id: creatorId, phone: '13900000001', phoneVerified: true } });
    await prisma.user.upsert({ where: { id: memberId }, update: { phoneVerified: true }, create: { id: memberId, phone: '13900000002', phoneVerified: true } });
    await prisma.user.upsert({ where: { id: outsiderId }, update: { phoneVerified: true }, create: { id: outsiderId, phone: '13900000003', phoneVerified: true } });
  });

  afterAll(async () => {
    if (prisma) {
      const fixtures = await prisma.trip.findMany({ where: { origin: { startsWith: fixturePrefix } }, select: { id: true } });
      await cleanupTripFixtures(prisma, fixtures.map(item => item.id));
    }
    await prisma?.$disconnect(); await app?.close();
  });
  beforeEach(() => throttlerStorage.storage.clear());

  it('creates a trip idempotently and permits a member join', async () => {
    const body = { origin: `${fixturePrefix}${runId}_起点`, destination: `${fixturePrefix}${runId}_终点`, departTime: new Date(Date.now() + 3_600_000).toISOString(), capacity: 3 };
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
    await expect(prisma.rideRecord.count({ where: { requestKey: key } })).resolves.toBe(1);
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

  it('maps a bounded transaction timeout to a controlled 503 when opening ride assistance', async () => {
    const transaction = jest.spyOn((platform as any).prisma, '$transaction').mockRejectedValueOnce({ code: 'P2028' });

    try {
      const response = await request(app.getHttpServer()).post(`/api/trips/${tripId}/ride/open`).set('x-user-id', creatorId)
        .set('Idempotency-Key', idempotencyKey('ride-state-busy')).send({ platform: 'manual' }).expect(503);
      expect(response.body).toEqual(expect.objectContaining({ message: 'RIDE_STATE_BUSY' }));
    } finally {
      transaction.mockRestore();
    }
  });

  it('maps a bounded transaction timeout to a controlled 503 when updating vehicle details', async () => {
    const transaction = jest.spyOn((platform as any).prisma, '$transaction').mockRejectedValueOnce({ code: 'P2024' });

    try {
      const response = await request(app.getHttpServer()).post(`/api/trips/${tripId}/vehicle`).set('x-user-id', creatorId)
        .set('Idempotency-Key', idempotencyKey('vehicle-state-busy')).send({ plate: '浙A66666' }).expect(503);
      expect(response.body).toEqual(expect.objectContaining({ message: 'RIDE_STATE_BUSY' }));
    } finally {
      transaction.mockRestore();
    }
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
    // The order flow consumes the immutable, all-member-locked fare plan;
    // older ride E2E setup only advanced the trip state directly.
    await prisma.farePlanRevision.create({
      data: { tripId, sequence: 1, plan: { mode: 'EQUAL' }, status: 'LOCKED', lockedAt: new Date() },
    });
    await request(app.getHttpServer()).post(`/api/trips/${tripId}/fare-screenshot-uploads`).set('x-user-id', creatorId)
      .send({ mimeType: 'image/png', sizeBytes: 100 }).expect(400);
    await request(app.getHttpServer()).post(`/api/trips/${tripId}/fare-screenshot-uploads`).set('x-user-id', creatorId)
      .set('Idempotency-Key', 'not valid!').send({ mimeType: 'image/png', sizeBytes: 100 }).expect(400);
    const intent = await request(app.getHttpServer()).post(`/api/trips/${tripId}/fare-screenshot-uploads`).set('x-user-id', creatorId)
      .set('Idempotency-Key', idempotencyKey('fare-upload')).send({ mimeType: 'image/png', sizeBytes: 100 }).expect(201);
    await storage.putForTest({ objectKey: intent.body.objectKey, uploadUrl: intent.body.uploadUrl, uploadToken: intent.body.uploadToken, expiresAt: new Date(intent.body.expiresAt) }, Buffer.alloc(100), 'image/png');
    const created = await request(app.getHttpServer()).post(`/api/trips/${tripId}/fare-order`).set('x-user-id', creatorId)
      .set('Idempotency-Key', idempotencyKey('fare-order'))
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

  it('replays a terminal fare-plan decision with a second key without aborting its PostgreSQL transaction', async () => {
    const planTrip = await prisma.trip.create({
      data: {
        creatorId, origin: `${fixturePrefix}${runId}_费用方案起点`, destination: `${fixturePrefix}${runId}_费用方案终点`, departTime: new Date(Date.now() + 7_200_000), capacity: 3,
        status: 'FORMED', feePlan: { mode: 'EQUAL' }, initialFarePlan: { mode: 'EQUAL' },
        members: { create: [{ userId: creatorId, role: 'CREATOR', memberCount: 1 }, { userId: memberId, role: 'MEMBER', memberCount: 1 }] },
      },
    });
    const base = await prisma.farePlanRevision.create({ data: { tripId: planTrip.id, sequence: 1, plan: { mode: 'EQUAL' }, status: 'LOCKED', lockedAt: new Date() } });
    await prisma.farePlanConfirmation.createMany({ data: [{ revisionId: base.id, userId: creatorId, status: 'CONFIRMED', confirmedAt: new Date() }, { revisionId: base.id, userId: memberId, status: 'CONFIRMED', confirmedAt: new Date() }] });

    const created = await request(app.getHttpServer()).post(`/api/trips/${planTrip.id}/fare-plan-change-requests`).set('x-user-id', creatorId)
      .set('Idempotency-Key', idempotencyKey('fare-plan-create')).send({ proposedPlan: { mode: 'EQUAL' }, reason: '重新确认' }).expect(201);
    const first = await request(app.getHttpServer()).post(`/api/fare-plan-change-requests/${created.body.id}/decisions`).set('x-user-id', memberId)
      .set('Idempotency-Key', idempotencyKey('fare-plan-vote-a')).send({ decision: 'APPROVED' }).expect(201);
    const replay = await request(app.getHttpServer()).post(`/api/fare-plan-change-requests/${created.body.id}/decisions`).set('x-user-id', memberId)
      .set('Idempotency-Key', idempotencyKey('fare-plan-vote-b')).send({ decision: 'APPROVED' }).expect(201);
    expect(replay.body.id).toBe(first.body.id);

    const otherTrip = await prisma.trip.create({
      data: { creatorId, origin: `${fixturePrefix}${runId}_另一费用方案起点`, destination: `${fixturePrefix}${runId}_另一费用方案终点`, departTime: new Date(Date.now() + 10_800_000), capacity: 3, status: 'FORMED', feePlan: { mode: 'EQUAL' }, members: { create: [{ userId: creatorId, role: 'CREATOR', memberCount: 1 }, { userId: memberId, role: 'MEMBER', memberCount: 1 }] } },
    });
    const otherBase = await prisma.farePlanRevision.create({ data: { tripId: otherTrip.id, sequence: 1, plan: { mode: 'EQUAL' }, status: 'LOCKED', lockedAt: new Date() } });
    await prisma.farePlanConfirmation.createMany({ data: [{ revisionId: otherBase.id, userId: creatorId, status: 'CONFIRMED', confirmedAt: new Date() }, { revisionId: otherBase.id, userId: memberId, status: 'CONFIRMED', confirmedAt: new Date() }] });
    const otherRequest = await request(app.getHttpServer()).post(`/api/trips/${otherTrip.id}/fare-plan-change-requests`).set('x-user-id', creatorId)
      .set('Idempotency-Key', idempotencyKey('other-fare-plan-create')).send({ proposedPlan: { mode: 'EQUAL' } }).expect(201);
    await request(app.getHttpServer()).post(`/api/fare-plan-change-requests/${otherRequest.body.id}/decisions`).set('x-user-id', memberId)
      .set('Idempotency-Key', idempotencyKey('fare-plan-vote-b')).send({ decision: 'APPROVED' }).expect(409);
  });

  it('runs the three-member fare-plan formation, change request, and re-confirmation flow over HTTP', async () => {
    const created = await request(app.getHttpServer()).post('/api/trips').set('x-user-id', creatorId)
      .set('Idempotency-Key', idempotencyKey('three-plan-trip'))
      .send({ origin: `${fixturePrefix}${runId}_三人方案起点`, destination: `${fixturePrefix}${runId}_三人方案终点`, departTime: new Date(Date.now() + 14_400_000).toISOString(), capacity: 3, feePlan: { mode: 'EQUAL' } }).expect(201);
    const id = created.body.id;
    await request(app.getHttpServer()).post(`/api/trips/${id}/join`).set('x-user-id', memberId).set('Idempotency-Key', idempotencyKey('three-plan-join-1')).send({ memberCount: 1 }).expect(201);
    await request(app.getHttpServer()).post(`/api/trips/${id}/join`).set('x-user-id', outsiderId).set('Idempotency-Key', idempotencyKey('three-plan-join-2')).send({ memberCount: 1 }).expect(201);
    for (const [user, suffix] of [[creatorId, 'creator'], [memberId, 'member'], [outsiderId, 'outsider']] as const) {
      await request(app.getHttpServer()).post(`/api/trips/${id}/confirmations`).set('x-user-id', user).set('Idempotency-Key', idempotencyKey(`three-plan-confirm-${suffix}`)).send({}).expect(201);
    }
    const initial = await request(app.getHttpServer()).get(`/api/trips/${id}/fare-plan`).set('x-user-id', memberId).expect(200);
    expect(initial.body.revision).toEqual(expect.objectContaining({ status: 'PENDING_CONFIRMATION' }));
    const revisionId = initial.body.revision.id;
    for (const [user, suffix] of [[creatorId, 'creator'], [memberId, 'member'], [outsiderId, 'outsider']] as const) {
      await request(app.getHttpServer()).post(`/api/trips/${id}/fare-plan-revisions/${revisionId}/confirm`).set('x-user-id', user).set('Idempotency-Key', idempotencyKey(`three-plan-revision-${suffix}`)).send({}).expect(201);
    }
    const locked = await request(app.getHttpServer()).get(`/api/trips/${id}/fare-plan`).set('x-user-id', memberId).expect(200);
    expect(locked.body.revision.status).toBe('LOCKED');
    const proposedPlan = { mode: 'CUSTOM', allocations: { [creatorId]: 34, [memberId]: 33, [outsiderId]: 33 } };
    const change = await request(app.getHttpServer()).post(`/api/trips/${id}/fare-plan-change-requests`).set('x-user-id', creatorId)
      .set('Idempotency-Key', idempotencyKey('three-plan-change')).send({ proposedPlan, reason: '测试变更' }).expect(201);
    await request(app.getHttpServer()).post(`/api/fare-plan-change-requests/${change.body.id}/decisions`).set('x-user-id', memberId)
      .set('Idempotency-Key', idempotencyKey('three-plan-change-member')).send({ decision: 'APPROVED' }).expect(201);
    await request(app.getHttpServer()).post(`/api/fare-plan-change-requests/${change.body.id}/decisions`).set('x-user-id', outsiderId)
      .set('Idempotency-Key', idempotencyKey('three-plan-change-outsider')).send({ decision: 'APPROVED' }).expect(201);
    const applied = await request(app.getHttpServer()).get(`/api/trips/${id}/fare-plan`).set('x-user-id', memberId).expect(200);
    await expect(prisma.farePlanChangeRequest.findUnique({ where: { id: change.body.id } })).resolves.toMatchObject({ status: 'APPLIED' });
    expect(applied.body.request).toBeNull();
    expect(applied.body.revision.status).toBe('PENDING_CONFIRMATION');
    const nextRevisionId = applied.body.revision.id;
    for (const [user, suffix] of [[creatorId, 'creator'], [memberId, 'member'], [outsiderId, 'outsider']] as const) {
      await request(app.getHttpServer()).post(`/api/trips/${id}/fare-plan-revisions/${nextRevisionId}/confirm`).set('x-user-id', user).set('Idempotency-Key', idempotencyKey(`three-plan-next-${suffix}`)).send({}).expect(201);
    }
    await expect(prisma.farePlanRevision.findUnique({ where: { id: nextRevisionId } })).resolves.toMatchObject({ status: 'LOCKED' });
    await expect(prisma.farePlanConfirmation.count({ where: { revisionId, status: 'VOID' } })).resolves.toBe(3);
  });

  it('uses the fare order ID for a member-only, idempotent review', async () => {
    const payload = { targetUserId: creatorId, punctuality: 5, communication: 4, safety: 5, politeness: 4 };
    const first = await request(app.getHttpServer()).post(`/api/fare-orders/${fareOrderId}/review`).set('x-user-id', memberId).set('Idempotency-Key', idempotencyKey('review')).send(payload).expect(201);
    const retried = await request(app.getHttpServer()).post(`/api/fare-orders/${fareOrderId}/review`).set('x-user-id', memberId).set('Idempotency-Key', idempotencyKey('review')).send(payload).expect(201);
    expect(retried.body.review.id).toBe(first.body.review.id);
    await request(app.getHttpServer()).post(`/api/fare-orders/${fareOrderId}/review`).set('x-user-id', creatorId).set('Idempotency-Key', idempotencyKey('self-review')).send({ ...payload, targetUserId: creatorId }).expect(403);
  });

  it('enforces 90-day screenshot retention, open-dispute pause, and HTTP 410 after deletion', async () => {
    const retentionTrip = await prisma.trip.create({
      data: { creatorId, origin: `${fixturePrefix}${runId}_留存起点`, destination: `${fixturePrefix}${runId}_留存终点`, departTime: new Date(Date.now() + 21_600_000), capacity: 3, status: 'PENDING_REVIEW', members: { create: [{ userId: creatorId, role: 'CREATOR', memberCount: 1 }, { userId: memberId, role: 'MEMBER', memberCount: 1 }] } },
    });
    const deadline = new Date('2026-04-01T00:00:00.000Z');
    const key = `fare-screenshots/${runId}/retention.png`;
    const retentionGrant = await storage.createUploadGrant({ key, mimeType: 'image/png', maxSizeBytes: 1024, expiresAt: new Date(Date.now() + 60_000) });
    await storage.putForTest(retentionGrant, Buffer.from('receipt'), 'image/png');
    const order = await prisma.fareOrder.create({ data: { tripId: retentionTrip.id, submittedBy: creatorId, totalAmountCents: 100, screenshotKey: key, screenshotMimeType: 'image/png', screenshotSizeBytes: 7, status: 'CONFIRMED', confirmedAt: new Date('2026-01-01T00:00:00.000Z'), retentionDeleteAfter: deadline } });
    await expect(fareService.cleanupExpiredBoundScreenshots(new Date('2026-03-31T23:59:59.999Z'))).resolves.toBe(0);
    await expect(fareService.cleanupExpiredBoundScreenshots(deadline)).resolves.toBe(1);
    await request(app.getHttpServer()).get(`/api/fare-orders/${order.id}/screenshot`).set('x-user-id', memberId).expect(410);

    const disputedTrip = await prisma.trip.create({
      data: { creatorId, origin: `${fixturePrefix}${runId}_争议起点`, destination: `${fixturePrefix}${runId}_争议终点`, departTime: new Date(Date.now() + 25_200_000), capacity: 3, status: 'ORDER_DISPUTED', disputeLocked: true, members: { create: [{ userId: creatorId, role: 'CREATOR', memberCount: 1 }, { userId: memberId, role: 'MEMBER', memberCount: 1 }] } },
    });
    const disputedKey = `fare-screenshots/${runId}/disputed.png`;
    const disputedGrant = await storage.createUploadGrant({ key: disputedKey, mimeType: 'image/png', maxSizeBytes: 1024, expiresAt: new Date(Date.now() + 60_000) });
    await storage.putForTest(disputedGrant, Buffer.from('receipt'), 'image/png');
    const disputedOrder = await prisma.fareOrder.create({ data: { tripId: disputedTrip.id, submittedBy: creatorId, totalAmountCents: 100, screenshotKey: disputedKey, screenshotMimeType: 'image/png', screenshotSizeBytes: 7, status: 'DISPUTED', retentionDeleteAfter: deadline } });
    await prisma.fareDispute.create({ data: { fareOrderId: disputedOrder.id, raisedBy: memberId, reason: '待处理', status: 'OPEN' } });
    await expect(fareService.cleanupExpiredBoundScreenshots(deadline)).resolves.toBe(0);
    await expect(prisma.fareOrder.findUniqueOrThrow({ where: { id: disputedOrder.id } })).resolves.toMatchObject({ screenshotDeletedAt: null });
  });

  it('returns 503 on a real PostgreSQL trip-row lock timeout and leaves no ride record', async () => {
    const lockedTrip = await prisma.trip.create({
      data: { creatorId, origin: `${fixturePrefix}${runId}_锁竞争起点`, destination: `${fixturePrefix}${runId}_锁竞争终点`, departTime: new Date(Date.now() + 28_800_000), capacity: 3, status: 'FORMED', members: { create: [{ userId: creatorId, role: 'CREATOR', memberCount: 1 }] } },
    });
    const previous = process.env.POSTGRES_LOCK_TIMEOUT_MS;
    process.env.POSTGRES_LOCK_TIMEOUT_MS = '250';
    let ready!: () => void;
    const lockReady = new Promise<void>(resolve => { ready = resolve; });
    const holder = prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM trips WHERE id = ${lockedTrip.id} FOR UPDATE`;
      ready();
      await new Promise(resolve => setTimeout(resolve, 600));
    }, { timeout: 2_000 });
    await lockReady;
    try {
      await request(app.getHttpServer()).post(`/api/trips/${lockedTrip.id}/ride/open`).set('x-user-id', creatorId)
        .set('Idempotency-Key', idempotencyKey('real-lock-timeout')).send({ platform: 'manual' }).expect(503);
      await expect(prisma.rideRecord.count({ where: { tripId: lockedTrip.id } })).resolves.toBe(0);
    } finally {
      await holder;
      if (previous === undefined) delete process.env.POSTGRES_LOCK_TIMEOUT_MS; else process.env.POSTGRES_LOCK_TIMEOUT_MS = previous;
    }
  });
});
