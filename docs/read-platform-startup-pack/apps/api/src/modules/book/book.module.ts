import { Module } from '@nestjs/common';
import * as path from 'path';
import { BookController } from './book.controller';
import { BookRepository } from './book.repository';
import { LocalFileBlobStorage } from '@reader/storage-core/node';

@Module({
  controllers: [BookController],
  providers: [
    BookRepository,
    {
      provide: LocalFileBlobStorage,
      useFactory: () => {
        const storagePath = path.resolve(
          process.cwd(),
          '../../data/storage/chapter_blobs/',
        );
        return new LocalFileBlobStorage(storagePath);
      },
    },
  ],
})
export class BookModule {}
