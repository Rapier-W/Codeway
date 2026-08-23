import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';
@Module({ controllers: [PlatformController], providers: [PlatformService, PrismaService] })
export class PlatformModule {}
