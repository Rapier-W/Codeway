import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';

describe('Trips API (e2e)', () => {
  let app: INestApplication;
  const prisma = { $transaction: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService).useValue(prisma).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => app.close());

  it('publishes a trip and rejects an invalid capacity', async () => {
    prisma.$transaction.mockImplementation(async (fn: any) => fn({
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'u1', phoneVerified: true }) },
      trip: { create: jest.fn().mockResolvedValue({ id: 't1', capacity: 3, status: 'RECRUITING' }) },
      tripMember: { create: jest.fn().mockResolvedValue({ id: 'm1', memberCount: 1 }) },
    }));
    await request(app.getHttpServer()).post('/trips').set('x-user-id', 'u1').send({
      origin: 'A', destination: 'B', departTime: new Date(Date.now() + 3600000).toISOString(), capacity: 3,
    }).expect(201);
    await request(app.getHttpServer()).post('/trips').set('x-user-id', 'u1').send({
      origin: 'A', destination: 'B', departTime: new Date(Date.now() + 3600000).toISOString(), capacity: 5,
    }).expect(400);
  });
});
