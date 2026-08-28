import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { FareService } from './fare.service';

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

@Injectable()
export class FareUploadCleanupService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;

  constructor(private readonly fare: FareService) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      // 孤儿上传意图：过期/未消费且非绑定订单的对象，每小时清理。
      void this.fare.cleanupExpiredUploads(new Date()).catch(() => undefined);
      // 阶段 3 + 阶段 10：已确认订单截图满 90 天保留期后删除对象并标记，每小时执行、幂等。
      void this.fare.cleanupExpiredBoundScreenshots(new Date()).catch(() => undefined);
    }, CLEANUP_INTERVAL_MS);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}
