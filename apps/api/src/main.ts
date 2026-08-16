import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as express from 'express';

const LOCALHOST_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;
// 局域网私网来源（RFC1918）：放行局域网内其他设备（手机/平板/另一台电脑）
// 通过 `scripts/start-app.sh` 一键启动的局域网地址访问本地书架。
const LAN_ORIGIN = /^https?:\/\/(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/i;

function isAllowedOrigin(origin: string): boolean {
  // 显式配置优先：CORS_ORIGIN 逗号分隔，覆盖默认策略。
  const configured = process.env.CORS_ORIGIN?.split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (configured && configured.length > 0) {
    return configured.includes(origin);
  }
  // 默认策略：放行本机来源（任意端口）+ 局域网私网来源（本地优先 PWA 局域网共享）。
  // 本地优先的 PWA 会在不同端口（3000/3001/3100/8080 等）被访问，
  // 固定白名单会导致「藏经阁」等云端接口被 CORS 拦截而显示离线。
  return LOCALHOST_ORIGIN.test(origin) || LAN_ORIGIN.test(origin);
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
