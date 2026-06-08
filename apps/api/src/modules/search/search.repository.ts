import { Injectable, Inject } from '@nestjs/common';
import { DRIZZLE } from '../database/database.module';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from '../database/schema';
import { inArray, sql } from 'drizzle-orm';

@Injectable()
export class SearchRepository {
  constructor(@Inject(DRIZZLE) private db: LibSQLDatabase<typeof schema>) {}

  async searchBooks(query: string, shareToken: string) {
    if (!query) return [];

    const results = await this.db.all<{ id: string }>(sql`
      SELECT id FROM books_search_v 
      WHERE books_search_v MATCH ${query} 
      ORDER BY rank
    `);

    const ids = results.map((row: { id: string }) => row.id);

    if (ids.length === 0) return [];

    // Filter IDs matching current shareToken scoping in memory
    const isDefault = shareToken === 'default';
    const filteredIds = ids.filter((id) => {
      if (isDefault) {
        return id.endsWith('#default') || !id.includes('#');
      } else {
        return id.endsWith(`#${shareToken}`);
      }
    });

    if (filteredIds.length === 0) return [];

    // Fetch full book details
    const dbBooks = await this.db.query.books.findMany({
      where: inArray(schema.books.id, filteredIds),
    });

    // Strip physical suffixes on return
    return dbBooks.map((book) => ({
      ...book,
      id: book.id.split('#')[0],
    }));
  }
}
