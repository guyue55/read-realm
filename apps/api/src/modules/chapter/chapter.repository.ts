import { Injectable, Inject } from '@nestjs/common';
import { DRIZZLE } from '../database/database.module';
import { LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from '../database/schema';
import { eq, and, or } from 'drizzle-orm';

@Injectable()
export class ChapterRepository {
  constructor(@Inject(DRIZZLE) private db: LibSQLDatabase<typeof schema>) {}

  /**
   * 🏮 构造按 shareToken 物理隔离的 bookId 匹配条件。
   * - default 书架：兼容历史无后缀及 `#default` 后缀两种存档。
   * - 任意自定义 token：严格只匹配 `${bookId}#${token}`，避免读到默认书架/其他 token 的章节。
   */
  private buildBookIdClause(bookId: string, shareToken: string) {
    const dbBookId = `${bookId}#${shareToken}`;
    if (shareToken === 'default' || !shareToken) {
      return or(
        eq(schema.chapters.bookId, dbBookId),
        eq(schema.chapters.bookId, `${bookId}#default`),
        eq(schema.chapters.bookId, bookId),
      );
    }
    return eq(schema.chapters.bookId, dbBookId);
  }

  async findByIndex(
    bookId: string,
    index: number,
    shareToken: string = 'default',
  ) {
    const whereClause = and(
      this.buildBookIdClause(bookId, shareToken),
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
    const whereClause = this.buildBookIdClause(bookId, shareToken);

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
