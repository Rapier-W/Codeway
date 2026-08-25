import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');

  // 联调期只放行本地 dev server；生产环境必须改成显式域名白名单。
  // 注意：当前后端信任 x-user-id 头，反射任意 Origin 会让任意站点携带身份发起请求。
  const allowedOrigins = process.env.CORS_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean)
    ?? ['http://localhost:5173', 'http://127.0.0.1:5173'];
  app.enableCors({ origin: allowedOrigins, credentials: true });

  // DTO 已补齐 class-validator 装饰器，开启 whitelist 剥离未声明字段。
  // forbidNonWhitelisted 保持关闭：多余字段静默丢弃而不是报错，避免前端多传字段直接 400。
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

  // 统一错误响应为 { code, message, statusCode }，前端据 code 判断业务分支。
  app.useGlobalFilters(new HttpExceptionFilter());

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
}

bootstrap();
