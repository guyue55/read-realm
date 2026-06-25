import { Module } from '@nestjs/common';
import { ChapterController } from './chapter.controller';
import { ChapterRepository } from './chapter.repository';
import { LocalFileBlobStorage } from '@reader/storage-core/node';
import { resolveBlobStoragePath } from '../../common/blob-storage-path';

@Module({
  controllers: [ChapterController],
  providers: [
    ChapterRepository,
    {
      provide: LocalFileBlobStorage,
      useFactory: () => new LocalFileBlobStorage(resolveBlobStoragePath()),
    },
  ],
  exports: [ChapterRepository],
})
export class ChapterModule {}
