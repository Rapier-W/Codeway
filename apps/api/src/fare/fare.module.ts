import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { FareController } from './fare.controller';
import { FareService } from './fare.service';
import { StorageModule } from '../storage/storage.module';
import { FareUploadCleanupService } from './fare-upload-cleanup.service';
@Module({ imports: [StorageModule], controllers: [FareController], providers: [FareService, FareUploadCleanupService, PrismaService], exports: [FareService] })
export class FareModule {}
