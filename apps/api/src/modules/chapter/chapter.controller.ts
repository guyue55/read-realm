import { Controller, Get, Param, NotFoundException, BadRequestException, ParseIntPipe } from '@nestjs/common';
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
  ) {
    const chapters = await this.chapterRepository.findByBookId(bookId, token);
    const chaptersWithContent = await Promise.all(
      chapters.map(async (chap) => {
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
