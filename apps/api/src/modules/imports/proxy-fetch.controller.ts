import { Body, Controller, Post } from '@nestjs/common';
import { z } from 'zod';
import { parseBody } from '../../common/request-boundary';
import { ProxyFetchService } from './proxy-fetch.service';

const ProxyFetchBodySchema = z.object({
  url: z.string().trim().min(1, '请提供需要抓取的 URL'),
});

/**
 * L1 静态抓取网络桥：仅返回 HTML，不做任何解析。
 * 解析由前端完成；本接口只解决浏览器 CORS/UA 限制。
 */
@Controller('imports/proxy')
export class ProxyFetchController {
  constructor(private readonly proxyFetchService: ProxyFetchService) {}

  @Post('fetch')
  async fetch(@Body() body: unknown) {
    const payload = parseBody(ProxyFetchBodySchema, body);
    return this.proxyFetchService.fetchHtml(payload.url);
  }
}
