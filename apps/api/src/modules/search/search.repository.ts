import { Injectable, Inject } from '@nestjs/common';
import { DRIZZLE } from '../database/database.module';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from '../database/schema';
import { inArray, sql } from 'drizzle-orm';

@Injectable()
export class SearchRepository {
  private static readonly MAX_RESULTS = 200;

  constructor(@Inject(DRIZZLE) private db: LibSQLDatabase<typeof schema>) {}

  /**
   * 在「默认书架」与「分享书架」之间做物理隔离的全文检索。
   * shareToken 缺省时按默认书架（无后缀或以 #default 结尾）过滤，避免把其他人的私享书一起返回。
   */
  async searchBooks(query: string, shareToken: string = 'default') {
    if (!query) return [];

    // 🏮 FTS5 query 语法对 `"` `*` `(` `)` `:` 等字符有特殊含义，
    // 用户直接搜索 `JS:权威指南` 之类的字符会触发 `SQLITE_ERROR: fts5 syntax error`。
    // 这里采用 phrase 包裹 + 转义双引号 的方式，把整串当作短语匹配。
    const sanitized = query.replace(/"/g, '""').trim();
    if (!sanitized) return [];
    const ftsQuery = `"${sanitized}"`;
    const normalizedToken = shareToken?.trim() || 'default';
    const isDefault = normalizedToken === 'default';
    const privateSuffix = `#${normalizedToken}`;
    const scopePredicate = isDefault
      ? sql`(instr(id, '#') = 0 OR substr(id, -8) = '#default')`
      : sql`substr(id, -${privateSuffix.length}) = ${privateSuffix}`;
    const results = await this.db.all<{ id: string }>(sql`
      SELECT id FROM books_search_v 
      WHERE books_search_v MATCH ${ftsQuery}
        AND ${scopePredicate}
      ORDER BY rank, id
      LIMIT ${sql.raw(String(SearchRepository.MAX_RESULTS))}
    `);

    const ids = results
      .map((row: { id: string }) => row.id)
      .filter((id) =>
        isDefault
          ? id.endsWith('#default') || !id.includes('#')
          : id.endsWith(privateSuffix),
      )
      .slice(0, SearchRepository.MAX_RESULTS);

    if (ids.length === 0) return [];

    // Fetch full book details
    const dbBooks = await this.db.query.books.findMany({
      where: inArray(schema.books.id, ids),
    });
    const booksById = new Map(dbBooks.map((book) => [book.id, book]));

    // Preserve the stable FTS rank/id order after the details lookup.
    return ids.flatMap((id) => {
      const book = booksById.get(id);
      return book ? [{ ...book, id: book.id.split('#')[0], tags: [] }] : [];
    });
  }
}
