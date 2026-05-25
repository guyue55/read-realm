import { Injectable, Inject } from '@nestjs/common';
import { DRIZZLE } from '../database/database.module';
import { LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from '../database/schema';
import { Book } from '@reader/shared-types';

@Injectable()
export class BookRepository {
  constructor(
    @Inject(DRIZZLE) private db: LibSQLDatabase<typeof schema>,
  ) {}

  async importBook(book: Book, chapters: (typeof schema.chapters.$inferInsert)[]) {
    await this.db.transaction(async (tx) => {
      // Omit tags if it's not in the schema
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { tags, ...bookData } = book;
      
      await tx.insert(schema.books).values(bookData as any);
      
      if (chapters.length > 0) {
        await tx.insert(schema.chapters).values(chapters);
      }
    });
  }
}
