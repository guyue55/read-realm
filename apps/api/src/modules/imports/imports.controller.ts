import { Body, Controller, Post } from '@nestjs/common';
import { UrlImportService } from './url-import.service';

@Controller('imports')
export class ImportsController {
  constructor(private readonly urlImportService: UrlImportService) {}

  @Post('url/parse')
  async parseUrl(@Body('url') url: string) {
    return this.urlImportService.parse(url);
  }
}
