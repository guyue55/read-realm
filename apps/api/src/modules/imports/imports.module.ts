import { Module } from '@nestjs/common';
import { ImportsController } from './imports.controller';
import { UrlImportService } from './url-import.service';

@Module({
  controllers: [ImportsController],
  providers: [UrlImportService],
})
export class ImportsModule {}
