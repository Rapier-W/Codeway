import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';
import { ConfirmationService } from './confirmation.service';
@Module({ controllers: [TripsController], providers: [TripsService, ConfirmationService, PrismaService] })
export class TripsModule {}
