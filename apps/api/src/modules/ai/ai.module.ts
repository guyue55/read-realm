import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { ChapterModule } from '../chapter/chapter.module';
import { OpenAIProvider } from '@reader/ai-core';
import { LocalFileBlobStorage } from '@reader/storage-core/node';
import * as path from 'path';

@Module({
  imports: [ChapterModule],
  controllers: [AiController],
  providers: [
    AiService,
    {
      provide: OpenAIProvider,
      useFactory: () => {
        return new OpenAIProvider(
          process.env.OPENAI_API_KEY || 'dummy-key',
          process.env.OPENAI_BASE_URL,
        );
      },
    },
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
export class AiModule {}
