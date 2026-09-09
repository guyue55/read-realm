import { Module } from '@nestjs/common';
import { ImportsController } from './imports.controller';
import { UrlImportService } from './url-import.service';
import { ProxyFetchController } from './proxy-fetch.controller';
import { ProxyFetchService } from './proxy-fetch.service';

@Module({
  controllers: [ImportsController, ProxyFetchController],
  providers: [UrlImportService, ProxyFetchService],
})
export class ImportsModule {}
