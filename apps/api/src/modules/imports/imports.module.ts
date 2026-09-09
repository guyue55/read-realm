import { Module } from '@nestjs/common';
import { ImportsController } from './imports.controller';
import { UrlImportService } from './url-import.service';
import { ProxyFetchController } from './proxy-fetch.controller';
import { ProxyFetchService } from './proxy-fetch.service';
import { HeadlessFetchController } from './headless-fetch.controller';
import { HeadlessFetchService } from './headless-fetch.service';

@Module({
  controllers: [
    ImportsController,
    ProxyFetchController,
    HeadlessFetchController,
  ],
  providers: [UrlImportService, ProxyFetchService, HeadlessFetchService],
})
export class ImportsModule {}
