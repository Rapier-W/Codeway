import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { HttpExceptionFilter } from './common/http-exception.filter';

/** Production and HTTP E2E share the same transport contract. */
export function configureHttpApp(app: INestApplication) {
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  const allowedOrigins = process.env.CORS_ORIGINS?.split(',').map((origin) => origin.trim()).filter(Boolean)
    ?? ['http://localhost:5173', 'http://127.0.0.1:5173'];
  app.enableCors({ origin: allowedOrigins, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.useGlobalFilters(new HttpExceptionFilter());
  return app;
}
