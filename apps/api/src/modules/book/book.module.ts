import { Module } from '@nestjs/common';
import { BookController } from './book.controller';
import { BookRepository } from './book.repository';
import { LocalFileBlobStorage } from '@reader/storage-core/node';
import { resolveBlobStoragePath } from '../../common/blob-storage-path';
import { PersonalPublicationExportController } from './personal-publication-export.controller';
import {
  PersonalPublicationExportRepository,
  PersonalPublicationExportService,
} from './personal-publication-export.service';

@Module({
  controllers: [BookController, PersonalPublicationExportController],
  providers: [
    BookRepository,
    PersonalPublicationExportRepository,
    PersonalPublicationExportService,
    {
      provide: LocalFileBlobStorage,
      useFactory: () => new LocalFileBlobStorage(resolveBlobStoragePath()),
    },
  ],
})
export class BookModule {}
