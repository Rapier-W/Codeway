import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { FareController } from './fare.controller';
import { FareService } from './fare.service';
import { StorageModule } from '../storage/storage.module';
@Module({ imports: [StorageModule], controllers: [FareController], providers: [FareService, PrismaService], exports: [FareService] })
export class FareModule {}
