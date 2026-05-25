import { Module } from '@nestjs/common';
import { BookController } from './book.controller';
import { BookRepository } from './book.repository';

@Module({
  controllers: [BookController],
  providers: [BookRepository],
})
export class BookModule {}
