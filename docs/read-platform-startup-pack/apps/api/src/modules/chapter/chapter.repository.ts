import { Injectable, Inject } from '@nestjs/common';
import { DRIZZLE } from '../database/database.module';
import { LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from '../database/schema';
import { eq, and } from 'drizzle-orm';

@Injectable()
export class ChapterRepository {
  constructor(
    @Inject(DRIZZLE) private db: LibSQLDatabase<typeof schema>,
  ) {}

  async findByIndex(bookId: string, index: number) {
    const results = await this.db.select()
      .from(schema.chapters)
      .where(
        and(
          eq(schema.chapters.bookId, bookId),
          eq(schema.chapters.index, index)
        )
      )
      .limit(1);
    
    return results[0] || null;
  }
}
