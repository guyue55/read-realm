import { Controller, Post, Body, Delete, Param } from '@nestjs/common';
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

  @Delete(':id')
  async deleteBook(@Param('id') id: string) {
    await this.bookRepository.deleteBook(id);
    return { success: true };
  }
}
