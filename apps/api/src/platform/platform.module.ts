import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';
import { RideModule } from '../ride/ride.module';

@Module({ imports: [RideModule], controllers: [PlatformController], providers: [PlatformService, PrismaService] })
export class PlatformModule {}
