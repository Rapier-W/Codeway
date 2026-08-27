import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { FareController } from './fare.controller';
import { FarePlanController } from './fare-plan.controller';
import { FareService } from './fare.service';
import { FarePlanService } from './fare-plan.service';
import { StorageModule } from '../storage/storage.module';
import { FareUploadCleanupService } from './fare-upload-cleanup.service';

@Module({
  imports: [StorageModule],
  controllers: [FareController, FarePlanController],
  providers: [FareService, FarePlanService, FareUploadCleanupService, PrismaService],
  exports: [FareService, FarePlanService],
})
export class FareModule {}
