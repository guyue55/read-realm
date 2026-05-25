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

        await client.execute('PRAGMA foreign_keys = ON;');

        // Initialize core tables for a fresh local database.
        await client.execute(`
          CREATE TABLE IF NOT EXISTS books (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            author TEXT,
            cover TEXT,
            description TEXT,
            source_type TEXT NOT NULL,
            source_url TEXT,
            format TEXT NOT NULL,
            status TEXT NOT NULL,
            chapter_count INTEGER NOT NULL,
            word_count INTEGER,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            last_read_at TEXT
          );
        `);
        await client.execute(`
          CREATE TABLE IF NOT EXISTS chapters (
            id TEXT PRIMARY KEY,
            book_id TEXT NOT NULL,
            "index" INTEGER NOT NULL,
            title TEXT NOT NULL,
            content_hash TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (book_id) REFERENCES books(id)
          );
        `);
        await client.execute(`
          CREATE TABLE IF NOT EXISTS storage_objects (
            hash TEXT PRIMARY KEY,
            path TEXT NOT NULL,
            size INTEGER NOT NULL,
            mime_type TEXT NOT NULL
          );
        `);
        await client.execute(`
          CREATE TABLE IF NOT EXISTS ai_views (
            id TEXT PRIMARY KEY,
            book_id TEXT NOT NULL,
            chapter_index INTEGER NOT NULL,
            source_hash TEXT NOT NULL,
            summary TEXT NOT NULL,
            model TEXT NOT NULL,
            prompt_version TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (book_id) REFERENCES books(id)
          );
        `);

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
