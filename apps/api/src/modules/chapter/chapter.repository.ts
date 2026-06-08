import { Injectable, Inject } from '@nestjs/common';
import { DRIZZLE } from '../database/database.module';
import { LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from '../database/schema';
import { eq, and, or } from 'drizzle-orm';

@Injectable()
export class ChapterRepository {
  constructor(@Inject(DRIZZLE) private db: LibSQLDatabase<typeof schema>) {}

  async findByIndex(bookId: string, index: number, shareToken: string = 'default') {
    const dbBookId = `${bookId}#${shareToken}`;
    const isDefault = shareToken === 'default';

    const whereClause = isDefault
      ? and(
          or(
            eq(schema.chapters.bookId, dbBookId),
            eq(schema.chapters.bookId, bookId),
          ),
          eq(schema.chapters.index, index),
        )
      : and(
          eq(schema.chapters.bookId, dbBookId),
          eq(schema.chapters.index, index),
        );

    const results = await this.db
      .select()
      .from(schema.chapters)
      .where(whereClause)
      .limit(1);

    if (!results[0]) return null;

    return {
      ...results[0],
      bookId: results[0].bookId.split('#')[0],
      id: results[0].id.split('#')[0],
    };
  }

  async findByBookId(bookId: string, shareToken: string = 'default') {
    const dbBookId = `${bookId}#${shareToken}`;
    const isDefault = shareToken === 'default';

    const whereClause = isDefault
      ? or(
          eq(schema.chapters.bookId, dbBookId),
          eq(schema.chapters.bookId, bookId),
        )
      : eq(schema.chapters.bookId, dbBookId);

    const results = await this.db
      .select()
      .from(schema.chapters)
      .where(whereClause);

    return results.map((chap) => ({
      ...chap,
      bookId: chap.bookId.split('#')[0],
      id: chap.id.split('#')[0],
    }));
  }
}
