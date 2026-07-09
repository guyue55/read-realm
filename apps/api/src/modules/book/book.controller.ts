import { Controller, Post, Body, Delete, Param, Get } from '@nestjs/common';
import { BookRepository } from './book.repository';
import { ShareToken } from '../../common/decorators/share-token.decorator';
import {
  ImportBookBodySchema,
  UpdateProgressBodySchema,
  parseBody,
} from '../../common/request-boundary';

@Controller('books')
export class BookController {
  constructor(private readonly bookRepository: BookRepository) {}

  @Get()
  async getBooks(@ShareToken() token: string) {
    return this.bookRepository.getAllBooks(token);
  }

  @Post('import')
  async importBook(@ShareToken() token: string, @Body() body: unknown) {
    const payload = parseBody(ImportBookBodySchema, body);
    await this.bookRepository.importBook(
      payload.metadata,
      payload.chapters,
      token,
      { replaceExisting: payload.replaceExisting },
    );
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
    @Body() body: unknown,
  ) {
    const payload = parseBody(UpdateProgressBodySchema, body);
    await this.bookRepository.updateProgress(
      id,
      payload.lastReadProgress,
      payload.lastReadAt,
      token,
      payload.sourceFolderId,
    );
    return { success: true };
  }

  @Delete()
  async clearAllBooks(@ShareToken() token: string) {
    await this.bookRepository.clearAllBooks(token);
    return { success: true };
  }
}
