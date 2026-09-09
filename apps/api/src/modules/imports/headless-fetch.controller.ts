import { Body, Controller, Post } from '@nestjs/common';
import { z } from 'zod';
import { parseBody } from '../../common/request-boundary';
import { HeadlessFetchService } from './headless-fetch.service';

const HeadlessFetchBodySchema = z.object({
  url: z.string().trim().min(1, '请提供需要渲染的 URL'),
});

/**
 * L2 headless 渲染调度入口。
 * 仅接收前端发起的渲染请求，返回渲染后的 HTML 与 meta（供前端升级 L3）。
 */
@Controller('imports/headless-fetch')
export class HeadlessFetchController {
  constructor(private readonly headlessFetchService: HeadlessFetchService) {}

  @Post()
  async render(@Body() body: unknown) {
    const payload = parseBody(HeadlessFetchBodySchema, body);
    return this.headlessFetchService.render(payload.url);
  }
}
