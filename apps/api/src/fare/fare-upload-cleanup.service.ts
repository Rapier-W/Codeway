import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { FareService } from './fare.service';

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

@Injectable()
export class FareUploadCleanupService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;

  constructor(private readonly fare: FareService) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.fare.cleanupExpiredUploads(new Date()).catch(() => undefined);
    }, CLEANUP_INTERVAL_MS);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}
