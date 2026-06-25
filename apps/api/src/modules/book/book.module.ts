import { Module } from '@nestjs/common';
import { BookController } from './book.controller';
import { BookRepository } from './book.repository';
import { LocalFileBlobStorage } from '@reader/storage-core/node';
import { resolveBlobStoragePath } from '../../common/blob-storage-path';

@Module({
  controllers: [BookController],
  providers: [
    BookRepository,
    {
      provide: LocalFileBlobStorage,
      useFactory: () => new LocalFileBlobStorage(resolveBlobStoragePath()),
    },
  ],
})
export class BookModule {}
