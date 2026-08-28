import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { FareService } from './fare.service';
import { FarePlanService } from './fare-plan.service';

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

@Injectable()
export class FareUploadCleanupService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;

  constructor(private readonly fare: FareService, private readonly farePlans: FarePlanService) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.fare.cleanupExpiredUploads(new Date()).catch(() => undefined);
      // Bound evidence has a separate 90-day policy. A failed storage delete
      // leaves its DB marker untouched and is retried by the next interval.
      void this.fare.cleanupExpiredBoundScreenshots(new Date()).catch(() => undefined);
      void this.farePlans.expirePendingChangeRequests(new Date()).catch(() => undefined);
    }, CLEANUP_INTERVAL_MS);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}
