import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { ChapterModule } from '../chapter/chapter.module';
import { OpenAIProvider } from '@reader/ai-core';
import { LocalFileBlobStorage } from '@reader/storage-core/node';
import { resolveBlobStoragePath } from '../../common/blob-storage-path';

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
      useFactory: () => new LocalFileBlobStorage(resolveBlobStoragePath()),
    },
  ],
})
export class AiModule {}
