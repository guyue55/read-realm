import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as express from 'express';

async function bootstrap() {
  // Disable default bodyParser to allow custom payload size limits
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  app.enableCors({
    origin: true,
  });
  await app.listen(process.env.PORT ?? 4000, '0.0.0.0');
}
void bootstrap();

