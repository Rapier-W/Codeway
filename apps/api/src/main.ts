import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import { configureHttpApp } from './http-app';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
  configureHttpApp(app);

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
}

bootstrap();
