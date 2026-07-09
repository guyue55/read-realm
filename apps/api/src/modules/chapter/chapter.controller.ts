import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { ChapterRepository } from './chapter.repository';
import { LocalFileBlobStorage } from '@reader/storage-core/node';
import { ShareToken } from '../../common/decorators/share-token.decorator';

@Controller('books/:bookId/chapters')
export class ChapterController {
  constructor(
    private readonly chapterRepository: ChapterRepository,
    private readonly blobStorage: LocalFileBlobStorage,
  ) {}

  @Get()
  async getAllChapters(
    @ShareToken() token: string,
    @Param('bookId') bookId: string,
    @Query('offset') rawOffset?: string,
    @Query('limit') rawLimit?: string,
  ) {
    const chapters = await this.chapterRepository.findByBookId(bookId, token);
    const hasPaging = rawOffset !== undefined || rawLimit !== undefined;
    const offset = Math.max(0, Number.parseInt(rawOffset || '0', 10) || 0);
    const requestedLimit =
      Number.parseInt(rawLimit || String(chapters.length), 10) ||
      chapters.length;
    const limit = hasPaging
      ? Math.min(Math.max(requestedLimit, 1), 200)
      : chapters.length;
    const selectedChapters = hasPaging
      ? chapters.slice(offset, offset + limit)
      : chapters;
    const chaptersWithContent = await Promise.all(
      selectedChapters.map(async (chap) => {
        try {
          const content = await this.blobStorage.getObject(chap.contentHash);
          return {
            ...chap,
            content: content.toString('utf-8'),
          };
        } catch {
          return {
            ...chap,
            content: '',
          };
        }
      }),
    );
    if (hasPaging) {
      return {
        items: chaptersWithContent,
        total: chapters.length,
        offset,
        limit,
      };
    }
    return chaptersWithContent;
  }

  @Get(':index')
  async getChapter(
    @ShareToken() token: string,
    @Param('bookId') bookId: string,
    @Param('index', ParseIntPipe) chapterIndex: number,
  ) {
    if (chapterIndex < 0) {
      throw new BadRequestException('章节序号必须为非负整数');
    }
    const chapter = await this.chapterRepository.findByIndex(
      bookId,
      chapterIndex,
      token,
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
    } catch {
      throw new NotFoundException('Chapter content not found');
    }
  }
}
