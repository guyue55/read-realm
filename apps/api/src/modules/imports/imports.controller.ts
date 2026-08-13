import { Body, Controller, Post } from '@nestjs/common';
import { UrlImportService } from './url-import.service';
import { z } from 'zod';
import { parseBody } from '../../common/request-boundary';

const ParseUrlBodySchema = z.object({
  url: z.string().trim().min(1, '请提供需要解析的 URL'),
  rightsConfirmed: z.literal(true, {
    message: '必须确认有权访问和保存该公开来源',
  }),
});

@Controller('imports')
export class ImportsController {
  constructor(private readonly urlImportService: UrlImportService) {}

  @Post('url/parse')
  async parseUrl(@Body() body: unknown) {
    const payload = parseBody(ParseUrlBodySchema, body);
    return this.urlImportService.parse(payload.url);
  }
}
