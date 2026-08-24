import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';

describe('Confirmations API (e2e)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService).useValue({ $transaction: jest.fn() }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });
  afterAll(async () => app.close());
  it('exposes confirmation endpoints', async () => {
    await request(app.getHttpServer()).post('/trips/t1/confirmations').set('x-user-id', 'u1').set('idempotency-key', 'k1').expect(201);
    await request(app.getHttpServer()).post('/trips/t1/confirmations/c1/withdraw').set('x-user-id', 'u1').expect(201);
  });

  it('exposes creator join-request decision endpoints', async () => {
    await request(app.getHttpServer()).post('/trips/t1/join-requests/m1/accept').set('x-user-id', 'creator').set('idempotency-key', 'accept-1').expect(201);
    await request(app.getHttpServer()).post('/trips/t1/join-requests/m1/reject').set('x-user-id', 'creator').set('idempotency-key', 'reject-1').expect(201);
  });
});
