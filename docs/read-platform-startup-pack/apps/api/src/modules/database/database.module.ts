import { Module, Global } from '@nestjs/common';
import { createClient, ResultSet } from '@libsql/client';
import { drizzle, LibSQLDatabase } from 'drizzle-orm/libsql';
import { SQL } from 'drizzle-orm';
import * as schema from './schema';
import * as path from 'path';

export const DRIZZLE = 'DRIZZLE_INSTANCE';
export type Database = LibSQLDatabase<typeof schema> & {
  execute: (query: SQL | string) => Promise<ResultSet>;
};

@Global()
@Module({
  providers: [
    {
      provide: DRIZZLE,
      useFactory: async () => {
        const dbPath = path.resolve(process.cwd(), '../../data/app.sqlite');
        const client = createClient({ url: `file:${dbPath}` });

        // Initialize FTS5 table
        await client.execute(`
          CREATE VIRTUAL TABLE IF NOT EXISTS books_search_v USING fts5(
            id UNINDEXED,
            title,
            author
          );
        `);

        // Sync existing data
        await client.execute(`
          INSERT OR IGNORE INTO books_search_v(id, title, author)
          SELECT id, title, author FROM books;
        `);

        // Create triggers for sync
        await client.execute(`
          CREATE TRIGGER IF NOT EXISTS books_ai AFTER INSERT ON books BEGIN
            INSERT INTO books_search_v(id, title, author) VALUES (new.id, new.title, new.author);
          END;
        `);
        await client.execute(`
          CREATE TRIGGER IF NOT EXISTS books_ad AFTER DELETE ON books BEGIN
            DELETE FROM books_search_v WHERE id = old.id;
          END;
        `);
        await client.execute(`
          CREATE TRIGGER IF NOT EXISTS books_au AFTER UPDATE ON books BEGIN
            UPDATE books_search_v SET title = new.title, author = new.author WHERE id = new.id;
          END;
        `);

        return drizzle(client, { schema });
      },
    },
  ],
  exports: [DRIZZLE],
})
export class DatabaseModule {}
