import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { DRIZZLE } from '../database/database.module';
import type { Database } from '../database/database.module';
import * as schema from '../database/schema';
import { eq, and } from 'drizzle-orm';
import { ChapterRepository } from '../chapter/chapter.repository';
import { OpenAIProvider } from '@reader/ai-core';
import { LocalFileBlobStorage } from '@reader/storage-core/node';
import { createId } from '@reader/shared-types';

@Injectable()
export class AiService {
  constructor(
    @Inject(DRIZZLE) private db: Database,
    private chapterRepository: ChapterRepository,
    private openAIProvider: OpenAIProvider,
    private storage: LocalFileBlobStorage,
  ) {}

  async summarize(bookId: string, chapterIndex: number) {
    const chapter = await this.chapterRepository.findByIndex(
      bookId,
      chapterIndex,
    );
    if (!chapter) {
      throw new NotFoundException('Chapter not found');
    }

    const model = 'gpt-3.5-turbo';
    const promptVersion = '1.0';

    // Check cache
    const cached = await this.db.query.aiViews.findFirst({
      where: and(
        eq(schema.aiViews.bookId, bookId),
        eq(schema.aiViews.chapterIndex, chapterIndex),
        eq(schema.aiViews.sourceHash, chapter.contentHash),
        eq(schema.aiViews.model, model),
        eq(schema.aiViews.promptVersion, promptVersion),
      ),
    });

    if (cached) {
      return cached;
    }

    // Read content
    const contentBuffer = await this.storage.getObject(chapter.contentHash);
    const content = contentBuffer.toString('utf-8');

    // Generate summary
    const summary = await this.openAIProvider.generateSummary(content);

    // Save to cache
    const aiView = {
      id: createId(),
      bookId,
      chapterIndex,
      sourceHash: chapter.contentHash,
      summary,
      model,
      promptVersion,
      createdAt: new Date().toISOString(),
    };

    await this.db.insert(schema.aiViews).values(aiView);

    return aiView;
  }
}
