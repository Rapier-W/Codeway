/**
 * 阶段 4：真实 PostgreSQL 锁竞争与状态超时验证。
 *
 * 用第二个 Prisma 连接持有行锁，验证并发请求返回 503 RIDE_STATE_BUSY。
 * 释放锁后用新键重试必须成功，且失败请求没有产生部分写入。
 */
const databaseUrl = process.env.E2E_DATABASE_URL;
if (!databaseUrl) throw new Error('E2E_DATABASE_URL is required');
process.env.DATABASE_URL = databaseUrl;

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureHttpApp } from '../src/http-app';
import { PrismaService } from '../src/prisma.service';
import { OBJECT_STORAGE_PROVIDER } from '../src/storage/object-storage.provider';
import { InMemoryObjectStorageProvider } from '../src/storage/in-memory-object-storage.provider';
import { createFixture, cleanupFixture, type PostgresFixture } from './helpers/postgres-fixture';

jest.setTimeout(60_000);

describe('PostgreSQL lock contention (real database)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let holder: PrismaClient;
  let fixture: PostgresFixture;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(OBJECT_STORAGE_PROVIDER).useValue(new InMemoryObjectStorageProvider())
      .compile();
    app = configureHttpApp(moduleRef.createNestApplication());
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.$connect();
    holder = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await holder.$connect();
  });

  afterAll(async () => {
    if (fixture) await cleanupFixture(prisma, fixture).catch(() => {});
    await holder?.$disconnect();
    await prisma?.$disconnect();
    await app?.close();
  });

  it('returns 503 RIDE_STATE_BUSY when another transaction holds the trip lock', async () => {
    const runToken = `lock-${Date.now().toString(36)}`;
    fixture = await createFixture(prisma, runToken);

    // 把行程状态推进到 FORMED，这样 openRide 才会尝试锁定
    await prisma.trip.update({ where: { id: fixture.tripId }, data: { status: 'FORMED' } });

    // 用第二个连接持有行锁
    const holderPromise = holder.$transaction(async (client) => {
      await client.$queryRawUnsafe('SELECT id FROM trips WHERE id = $1 FOR UPDATE', fixture.tripId);
      // 持有锁 5 秒，足够让并发请求触发 lock_timeout
      await new Promise((resolve) => setTimeout(resolve, 5000));
    });

    // 等 500ms 确保 holder 已获取锁
    await new Promise((resolve) => setTimeout(resolve, 500));

    // 并发请求应该因为 lock_timeout 返回 503
    const response = await request(app.getHttpServer())
      .post(`/api/trips/${fixture.tripId}/ride/open`)
      .set('x-user-id', fixture.creatorId)
      .set('Idempotency-Key', fixture.idempotencyKey('ride-locked'))
      .send({ platform: 'amap' });

    // 等待 holder 释放锁
    await holderPromise.catch(() => {});

    expect([503].includes(response.status)).toBe(true);
    expect(response.body.code).toBe('RIDE_STATE_BUSY');

    // 验证没有产生部分写入
    const rideRecords = await prisma.rideRecord.findMany({ where: { tripId: fixture.tripId } });
    expect(rideRecords.length).toBe(0);
  });

  it('succeeds after lock is released with a new idempotency key', async () => {
    // 行程已经是 FORMED 状态，没有竞争锁，应该成功
    const response = await request(app.getHttpServer())
      .post(`/api/trips/${fixture.tripId}/ride/open`)
      .set('x-user-id', fixture.creatorId)
      .set('Idempotency-Key', fixture.idempotencyKey('ride-success'))
      .send({ platform: 'amap' })
      .expect(201);

    expect(response.body).toHaveProperty('launch');
    expect(response.body).toHaveProperty('duplicate', false);

    // 验证确实写了 RideRecord
    const rideRecords = await prisma.rideRecord.findMany({ where: { tripId: fixture.tripId } });
    expect(rideRecords.length).toBe(1);
  });
});
