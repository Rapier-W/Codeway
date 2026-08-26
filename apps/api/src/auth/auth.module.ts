import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { PrismaService } from '../prisma.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { SmsService } from './sms.service';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      { ttl: 60_000, limit: 20 },
      { name: 'auth', ttl: 60_000, limit: 10 },
    ]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    SmsService,
    PrismaService,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
  exports: [AuthService, SmsService],
})
export class AuthModule {}
