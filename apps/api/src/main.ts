import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  // 联调期只放行本地 dev server；生产环境必须改成显式域名白名单。
  // 注意：当前后端信任 x-user-id 头，反射任意 Origin 会让任意站点携带身份发起请求。
  const allowedOrigins = process.env.CORS_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean)
    ?? ['http://localhost:5173', 'http://127.0.0.1:5173'];
  app.enableCors({ origin: allowedOrigins, credentials: true });
  // 注意：当前 DTO 未添加 class-validator 装饰器，开启 whitelist 会把请求字段全部剥离。
  // 待各 DTO 补齐装饰器后再开启 whitelist。
  app.useGlobalPipes(new ValidationPipe({ transform: true }));
  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
}

bootstrap();
