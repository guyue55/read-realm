import { Controller, Get, Param, NotFoundException } from '@nestjs/common';
import { ChapterRepository } from './chapter.repository';
import { LocalFileBlobStorage } from '@reader/storage-core/node';

@Controller('books/:bookId/chapters')
export class ChapterController {
  constructor(
    private readonly chapterRepository: ChapterRepository,
    private readonly blobStorage: LocalFileBlobStorage,
  ) {}

  @Get(':index')
  async getChapter(
    @Param('bookId') bookId: string,
    @Param('index') index: string,
  ) {
    const chapterIndex = parseInt(index, 10);
    const chapter = await this.chapterRepository.findByIndex(
      bookId,
      chapterIndex,
    );

    if (!chapter) {
      throw new NotFoundException('Chapter not found');
    }

    try {
      const content = await this.blobStorage.getObject(chapter.contentHash);
      return {
        ...chapter,
        content: content.toString('utf-8'),
      };
    } catch (error) {
      throw new NotFoundException('Chapter content not found');
    }
  }
}
