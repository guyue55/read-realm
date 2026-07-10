import { createClient, type Client } from '@libsql/client';
import { ensureChapterIntegrity, prepareDatabase } from './database-bootstrap';

async function withMemoryClient(
  run: (client: Client) => Promise<void>,
): Promise<void> {
  const client = createClient({ url: 'file::memory:' });

  try {
    await run(client);
  } finally {
    client.close();
  }
}

async function createLegacyChapterSchema(client: Client): Promise<void> {
  await client.execute(`
    CREATE TABLE books (
      id TEXT PRIMARY KEY,
      chapter_count INTEGER NOT NULL
    );
  `);
  await client.execute(`
    CREATE TABLE chapters (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL,
      "index" INTEGER NOT NULL,
      title TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}

describe('database bootstrap', () => {
  it('保留 created_at 最新且 id 较大的章节并建立真实唯一索引', async () => {
    await withMemoryClient(async (client) => {
      await createLegacyChapterSchema(client);
      await client.execute("INSERT INTO books VALUES ('book-1', 99)");
      await client.execute("INSERT INTO books VALUES ('book-empty', 7)");
      await client.execute(
        "INSERT INTO chapters VALUES ('old', 'book-1', 0, '旧章', 'a', '2026-01-01T00:00:00.000Z')",
      );
      await client.execute(
        "INSERT INTO chapters VALUES ('new', 'book-1', 0, '新章', 'b', '2026-01-02T00:00:00.000Z')",
      );
      await client.execute(
        "INSERT INTO chapters VALUES ('same-a', 'book-1', 1, '同刻旧章', 'c', '2026-01-03T00:00:00.000Z')",
      );
      await client.execute(
        "INSERT INTO chapters VALUES ('same-z', 'book-1', 1, '同刻新章', 'd', '2026-01-03T00:00:00.000Z')",
      );
      await client.execute(
        "INSERT INTO chapters VALUES ('only', 'book-1', 2, '独立章', 'e', '2026-01-04T00:00:00.000Z')",
      );
      await client.execute('CREATE TABLE book_updates (book_id TEXT NOT NULL)');
      await client.execute(`
        CREATE TRIGGER audit_book_updates AFTER UPDATE ON books BEGIN
          INSERT INTO book_updates(book_id) VALUES (new.id);
        END
      `);

      const result = await ensureChapterIntegrity(client);
      const secondResult = await ensureChapterIntegrity(client);
      const chapters = await client.execute(
        'SELECT id FROM chapters ORDER BY "index"',
      );
      const books = await client.execute(
        'SELECT id, chapter_count FROM books ORDER BY id',
      );
      const indexes = await client.execute("PRAGMA index_list('chapters')");
      const indexColumns = await client.execute(
        "PRAGMA index_info('chapters_book_id_index_uq')",
      );
      const bookUpdates = await client.execute(
        'SELECT book_id FROM book_updates ORDER BY book_id',
      );

      expect(result).toEqual({
        deduplicatedChapters: 2,
        uniqueIndexReady: true,
      });
      expect(secondResult).toEqual({
        deduplicatedChapters: 0,
        uniqueIndexReady: true,
      });
      expect(chapters.rows).toEqual([
        { id: 'new' },
        { id: 'same-z' },
        { id: 'only' },
      ]);
      expect(books.rows).toEqual([
        { id: 'book-1', chapter_count: 3 },
        { id: 'book-empty', chapter_count: 0 },
      ]);
      expect(
        indexes.rows.some(
          (row) => row.name === 'chapters_book_id_index_uq' && row.unique === 1,
        ),
      ).toBe(true);
      expect(indexColumns.rows.map((row) => row.name)).toEqual([
        'book_id',
        'index',
      ]);
      expect(bookUpdates.rows).toEqual([
        { book_id: 'book-1' },
        { book_id: 'book-empty' },
      ]);
    });
  });

  it.each([
    {
      label: '同名非唯一索引',
      indexSql:
        'CREATE INDEX chapters_book_id_index_uq ON chapters(book_id, "index")',
    },
    {
      label: '同名列不匹配的唯一索引',
      indexSql:
        'CREATE UNIQUE INDEX chapters_book_id_index_uq ON chapters(id, book_id)',
    },
  ])('$label 会使去重和计数更新全部回滚', async ({ indexSql }) => {
    await withMemoryClient(async (client) => {
      await createLegacyChapterSchema(client);
      await client.execute(indexSql);
      await client.execute("INSERT INTO books VALUES ('book-1', 9)");
      await client.execute(
        "INSERT INTO chapters VALUES ('old', 'book-1', 0, '旧章', 'a', '2026-01-01T00:00:00.000Z')",
      );
      await client.execute(
        "INSERT INTO chapters VALUES ('new', 'book-1', 0, '新章', 'b', '2026-01-02T00:00:00.000Z')",
      );

      await expect(ensureChapterIntegrity(client)).rejects.toThrow(
        'chapters_book_id_index_uq',
      );

      const chapters = await client.execute(
        'SELECT id FROM chapters ORDER BY id',
      );
      const book = await client.execute(
        "SELECT chapter_count FROM books WHERE id = 'book-1'",
      );

      expect(chapters.rows).toEqual([{ id: 'new' }, { id: 'old' }]);
      expect(book.rows).toEqual([{ chapter_count: 9 }]);
    });
  });

  it('prepareDatabase 会为历史 books 表补齐阅读进度和书箧列', async () => {
    await withMemoryClient(async (client) => {
      await client.execute(`
        CREATE TABLE books (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          author TEXT,
          chapter_count INTEGER NOT NULL
        );
      `);
      await client.execute(`
        CREATE TABLE chapters (
          id TEXT PRIMARY KEY,
          book_id TEXT NOT NULL,
          "index" INTEGER NOT NULL,
          title TEXT NOT NULL,
          content_hash TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
      `);

      await prepareDatabase(client);

      const bookColumns = await client.execute("PRAGMA table_info('books')");
      expect(bookColumns.rows.map((row) => row.name)).toEqual(
        expect.arrayContaining(['last_read_progress', 'source_folder_id']),
      );
    });
  });

  it('修复重复搜索行且连续准备不会再次增长', async () => {
    await withMemoryClient(async (client) => {
      await prepareDatabase(client);
      await client.execute(`
        INSERT INTO books (
          id,
          title,
          source_type,
          format,
          status,
          chapter_count,
          created_at,
          updated_at
        ) VALUES (
          'book-1',
          '可搜索标题',
          'local',
          'txt',
          'ready',
          0,
          '2026-01-01T00:00:00.000Z',
          '2026-01-01T00:00:00.000Z'
        )
      `);
      await client.execute(`
        INSERT INTO books_search_v(id, title, author)
        VALUES ('book-1', '可搜索标题', NULL)
      `);

      await prepareDatabase(client);
      await client.execute(`
        UPDATE books_search_v
        SET title = '过期标题'
        WHERE id = 'book-1'
      `);
      await prepareDatabase(client);
      await prepareDatabase(client);

      const searchRows = await client.execute(`
        SELECT id, title, author
        FROM books_search_v
        WHERE id = 'book-1'
      `);

      expect(searchRows.rows).toEqual([
        { id: 'book-1', title: '可搜索标题', author: null },
      ]);
    });
  });

  it('prepareDatabase 可完整准备空库并保留搜索同步能力', async () => {
    await withMemoryClient(async (client) => {
      const result = await prepareDatabase(client);
      const tables = await client.execute(`
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
        ORDER BY name
      `);
      const bookColumns = await client.execute("PRAGMA table_info('books')");
      const chapterIndexes = await client.execute(
        "PRAGMA index_list('chapters')",
      );
      const aiViewIndexes = await client.execute(
        "PRAGMA index_list('ai_views')",
      );
      const triggers = await client.execute(`
        SELECT name
        FROM sqlite_master
        WHERE type = 'trigger'
        ORDER BY name
      `);
      const foreignKeys = await client.execute('PRAGMA foreign_keys');

      expect(result).toEqual({
        deduplicatedChapters: 0,
        uniqueIndexReady: true,
      });
      expect(tables.rows.map((row) => row.name)).toEqual(
        expect.arrayContaining([
          'ai_views',
          'books',
          'books_search_v',
          'chapters',
          'library_folders',
          'storage_objects',
        ]),
      );
      expect(bookColumns.rows.map((row) => row.name)).toEqual(
        expect.arrayContaining(['last_read_progress', 'source_folder_id']),
      );
      expect(chapterIndexes.rows.map((row) => row.name)).toEqual(
        expect.arrayContaining([
          'chapters_book_id_index_uq',
          'chapters_content_hash_idx',
        ]),
      );
      expect(aiViewIndexes.rows.map((row) => row.name)).toContain(
        'ai_views_book_chapter_idx',
      );
      expect(triggers.rows.map((row) => row.name)).toEqual([
        'books_ad',
        'books_ai',
        'books_au',
      ]);
      expect(foreignKeys.rows).toEqual([{ foreign_keys: 1 }]);

      await client.execute(`
        INSERT INTO books (
          id,
          title,
          source_type,
          format,
          status,
          chapter_count,
          created_at,
          updated_at
        ) VALUES (
          'book-1',
          '可搜索标题',
          'local',
          'txt',
          'ready',
          0,
          '2026-01-01T00:00:00.000Z',
          '2026-01-01T00:00:00.000Z'
        )
      `);
      const searchRows = await client.execute(
        "SELECT id, title FROM books_search_v WHERE id = 'book-1'",
      );

      expect(searchRows.rows).toEqual([{ id: 'book-1', title: '可搜索标题' }]);
    });
  });
});
