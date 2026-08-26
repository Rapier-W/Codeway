import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureHttpApp } from '../http-app';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';

describe('PlatformController ride validation', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [PlatformController],
      providers: [{
        provide: PlatformService,
        useValue: { openRide: jest.fn().mockResolvedValue({ id: 'ride-1' }) },
      }],
    }).compile();
    app = configureHttpApp(module.createNestApplication());
    await app.init();
  });

  afterAll(async () => app.close());

  it('rejects an unknown ride platform before calling the state service', async () => {
    await request(app.getHttpServer())
      .post('/api/trips/t1/ride/open')
      .set('x-user-id', 'u1')
      .send({ platform: 'unknown' })
      .expect(400);
  });
});
