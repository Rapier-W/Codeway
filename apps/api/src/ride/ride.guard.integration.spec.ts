import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AmapService } from '../amap/amap.service';
import { AppModule } from '../app.module';
import { configureHttpApp } from '../http-app';
import { PrismaService } from '../prisma.service';

describe('Ride route protection', () => {
  let app: INestApplication;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalSkipDbConnect = process.env.SKIP_DB_CONNECT;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.SKIP_DB_CONNECT = 'true';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        user: { findUnique: jest.fn().mockResolvedValue({ id: 'ride-test-user', phoneVerified: true }) },
      })
      .overrideProvider(AmapService)
      .useValue({
        searchPlaces: jest.fn().mockResolvedValue([]),
        geocode: jest.fn().mockResolvedValue([]),
        routeDistance: jest.fn().mockResolvedValue({ distanceMeters: 1, durationSeconds: 1, source: 'estimate' }),
      })
      .compile();
    app = configureHttpApp(moduleRef.createNestApplication());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    process.env.NODE_ENV = originalNodeEnv;
    process.env.SKIP_DB_CONNECT = originalSkipDbConnect;
  });

  it('rejects unauthenticated map lookup requests', async () => {
    await request(app.getHttpServer()).get('/api/ride/places').query({ keyword: '虹桥站' }).expect(401);
  });

  it('throttles authenticated map lookup requests after the endpoint limit', async () => {
    const client = request(app.getHttpServer());
    for (let count = 0; count < 10; count += 1) {
      await client.get('/api/ride/places').set('x-user-id', 'ride-test-user').query({ keyword: '虹桥站' }).expect(200);
    }
    await client.get('/api/ride/places').set('x-user-id', 'ride-test-user').query({ keyword: '虹桥站' }).expect(429);
  });
});
