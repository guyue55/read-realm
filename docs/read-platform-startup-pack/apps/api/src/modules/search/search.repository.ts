import { Injectable, Inject } from '@nestjs/common';
import { DRIZZLE } from '../database/database.module';
import type { Database } from '../database/database.module';
import * as schema from '../database/schema';
import { inArray, sql } from 'drizzle-orm';

@Injectable()
export class SearchRepository {
  constructor(@Inject(DRIZZLE) private db: Database) {}

  async searchBooks(query: string) {
    if (!query) return [];

    // FTS5 search using sql helper for correct raw SQL execution in Drizzle
    const results = await this.db.execute(sql`
      SELECT id FROM books_search_v 
      WHERE books_search_v MATCH ${query} 
      ORDER BY rank
    `);

    // Explicit type for map parameter 'row' to satisfy lint rules and ensure type safety
    const ids = (results.rows as unknown as { id: string }[]).map(
      (row: { id: string }) => row.id,
    );

    if (ids.length === 0) return [];

    // Fetch full book details
    return this.db.query.books.findMany({
      where: inArray(schema.books.id, ids),
    });
  }
}
