import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as express from 'express';

function getAllowedOrigins() {
  const configured = process.env.CORS_ORIGIN?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (configured && configured.length > 0) return configured;

  return [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3001',
  ];
}

async function bootstrap() {
  // Disable default bodyParser to allow custom payload size limits
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  const bodyLimit = process.env.API_BODY_LIMIT || '10mb';
  app.use(express.json({ limit: bodyLimit }));
  app.use(express.urlencoded({ limit: bodyLimit, extended: true }));

  app.enableCors({
    origin(
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) {
      if (!origin || getAllowedOrigins().includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('CORS_NOT_ALLOWED'));
    },
  });
  await app.listen(
    process.env.PORT ?? 4000,
    process.env.API_HOST || '127.0.0.1',
  );
}
void bootstrap();
