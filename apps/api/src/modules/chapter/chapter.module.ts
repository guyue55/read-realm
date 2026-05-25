import { Module } from '@nestjs/common';
import * as path from 'path';
import { ChapterController } from './chapter.controller';
import { ChapterRepository } from './chapter.repository';
import { LocalFileBlobStorage } from '@reader/storage-core/node';

@Module({
  controllers: [ChapterController],
  providers: [
    ChapterRepository,
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
  exports: [ChapterRepository],
})
export class ChapterModule {}
