import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { FareController } from './fare.controller';
import { FareService } from './fare.service';
import { StorageModule } from '../storage/storage.module';
import { FareUploadCleanupService } from './fare-upload-cleanup.service';
import { FarePlanService } from './fare-plan.service';
import { FarePlanController } from './fare-plan.controller';
@Module({ imports: [StorageModule], controllers: [FareController, FarePlanController], providers: [FareService, FareUploadCleanupService, FarePlanService, PrismaService], exports: [FareService, FarePlanService] })
export class FareModule {}
