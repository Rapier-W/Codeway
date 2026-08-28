import { FareUploadCleanupService } from './fare-upload-cleanup.service';

describe('FareUploadCleanupService', () => {
  afterEach(() => jest.useRealTimers());

  it('runs bound screenshot retention cleanup alongside unclaimed-upload cleanup', async () => {
    jest.useFakeTimers();
    const fare = {
      cleanupExpiredUploads: jest.fn().mockResolvedValue(0),
      cleanupExpiredBoundScreenshots: jest.fn().mockResolvedValue(0),
    } as any;
    const farePlans = { expirePendingChangeRequests: jest.fn().mockResolvedValue(0) } as any;
    const service = new FareUploadCleanupService(fare, farePlans);

    service.onModuleInit();
    await jest.advanceTimersByTimeAsync(60 * 60 * 1000);

    expect(fare.cleanupExpiredUploads).toHaveBeenCalledTimes(1);
    expect(fare.cleanupExpiredBoundScreenshots).toHaveBeenCalledTimes(1);
    expect(farePlans.expirePendingChangeRequests).toHaveBeenCalledTimes(1);
    service.onModuleDestroy();
  });
});
