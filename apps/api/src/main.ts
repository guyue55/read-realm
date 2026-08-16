import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as express from 'express';

const LOCALHOST_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

function isAllowedOrigin(origin: string): boolean {
  // 显式配置优先：CORS_ORIGIN 逗号分隔，覆盖默认策略。
  const configured = process.env.CORS_ORIGIN?.split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (configured && configured.length > 0) {
    return configured.includes(origin);
  }
  // 默认策略：只放行本机来源（任意端口），远程跨域来源一律拒绝。
  // 本地优先的 PWA 会在不同端口（3000/3001/3100/8080 等）被访问，
  // 固定白名单会导致「藏经阁」等云端接口被 CORS 拦截而显示离线。
  return LOCALHOST_ORIGIN.test(origin);
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
      if (!origin || isAllowedOrigin(origin)) {
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
