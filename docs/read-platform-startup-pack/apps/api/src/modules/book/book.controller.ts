import { Controller, Post, Body } from '@nestjs/common';
import { BookRepository } from './book.repository';
import { Book } from '@reader/shared-types';

@Controller('books')
export class BookController {
  constructor(private readonly bookRepository: BookRepository) {}

  @Post('import')
  async importBook(@Body() body: { metadata: Book; chapters: any[] }) {
    await this.bookRepository.importBook(body.metadata, body.chapters);
    return { success: true };
  }
}
