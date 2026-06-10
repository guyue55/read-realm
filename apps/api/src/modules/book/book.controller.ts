/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Controller, Post, Body, Delete, Param, Get } from '@nestjs/common';
import { BookRepository } from './book.repository';
import { Book } from '@reader/shared-types';
import { ShareToken } from '../../common/decorators/share-token.decorator';

@Controller('books')
export class BookController {
  constructor(private readonly bookRepository: BookRepository) {}

  @Get()
  async getBooks(@ShareToken() token: string) {
    return this.bookRepository.getAllBooks(token);
  }

  @Post('import')
  async importBook(
    @ShareToken() token: string,
    @Body() body: { metadata: Book; chapters: any[] },
  ) {
    await this.bookRepository.importBook(body.metadata, body.chapters, token);
    return { success: true };
  }

  @Delete(':id')
  async deleteBook(@ShareToken() token: string, @Param('id') id: string) {
    await this.bookRepository.deleteBook(id, token);
    return { success: true };
  }

  @Post(':id/progress')
  async updateProgress(
    @ShareToken() token: string,
    @Param('id') id: string,
    @Body() body: { lastReadProgress: string; lastReadAt?: string; sourceFolderId?: string | null },
  ) {
    await this.bookRepository.updateProgress(
      id,
      body.lastReadProgress,
      body.lastReadAt,
      token,
      body.sourceFolderId,
    );
    return { success: true };
  }

  @Delete()
  async clearAllBooks(@ShareToken() token: string) {
    await this.bookRepository.clearAllBooks(token);
    return { success: true };
  }
}
