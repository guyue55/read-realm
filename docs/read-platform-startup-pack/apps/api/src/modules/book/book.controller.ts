import { Controller, Post, Body } from '@nestjs/common';
import { BookRepository } from './book.repository';
import { Book } from '@reader/shared-types';

@Controller('books')
export class BookController {
  constructor(private readonly bookRepository: BookRepository) {}

  @Post('import')
  async importBook(@Body() body: { book: Book; chapters: any[] }) {
    await this.bookRepository.importBook(body.book, body.chapters);
    return { success: true };
  }
}
