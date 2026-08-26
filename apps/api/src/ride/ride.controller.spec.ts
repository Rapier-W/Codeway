import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureHttpApp } from '../http-app';
import { RideController } from './ride.controller';
import { RideService } from './ride.service';

describe('RideController validation', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [RideController],
      providers: [{
        provide: RideService,
        useValue: {
          places: jest.fn().mockResolvedValue([]),
          geocode: jest.fn().mockResolvedValue([]),
          route: jest.fn().mockResolvedValue({ distanceMeters: 1, durationSeconds: 1, source: 'estimate' }),
          openRide: jest.fn().mockReturnValue({ platform: 'manual', fallbackLevel: 'copy-route', copyRouteText: 'x', hint: 'x' }),
        },
      }],
    }).compile();
    app = module.createNestApplication();
    configureHttpApp(app);
    await app.init();
  });

  afterAll(async () => app.close());

  it('rejects empty and overlong map keywords through DTO validation', async () => {
    await request(app.getHttpServer()).get('/api/ride/places').query({ keyword: '' }).expect(400);
    await request(app.getHttpServer()).get('/api/ride/geocode').query({ keyword: 'x'.repeat(81) }).expect(400);
  });

  it('rejects out-of-range coordinates through DTO validation before opening a ride', async () => {
    await request(app.getHttpServer())
      .post('/api/ride/open')
      .send({
        origin: '同济大学四平路校区',
        destination: '上海虹桥站',
        platform: 'amap',
        originPoint: { longitude: 181, latitude: 31.283 },
        destinationPoint: { longitude: 121.326, latitude: 31.197 },
      })
      .expect(400);
  });
});
