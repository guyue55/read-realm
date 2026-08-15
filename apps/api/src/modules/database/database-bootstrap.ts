import type { Client } from '@libsql/client';

const CHAPTER_UNIQUE_INDEX = 'chapters_book_id_index_uq';
const CHAPTER_UNIQUE_COLUMNS = ['book_id', 'index'] as const;

const CORE_TABLE_STATEMENTS = [
  `
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
      last_read_at TEXT,
      last_read_progress TEXT,
      source_folder_id TEXT
    );
  `,
  `
    CREATE TABLE IF NOT EXISTS library_folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      parent_id TEXT,
      source_id TEXT,
      source_type TEXT NOT NULL,
      relative_path TEXT,
      depth INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `,
  `
    CREATE TABLE IF NOT EXISTS chapters (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL,
      "index" INTEGER NOT NULL,
      title TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (book_id) REFERENCES books(id)
    );
  `,
  `
    CREATE TABLE IF NOT EXISTS storage_objects (
      hash TEXT PRIMARY KEY,
      path TEXT NOT NULL,
      size INTEGER NOT NULL,
      mime_type TEXT NOT NULL
    );
  `,
  `
    CREATE TABLE IF NOT EXISTS personal_export_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      scope_salt TEXT NOT NULL CHECK (
        length(scope_salt) = 64 AND scope_salt NOT GLOB '*[^0-9a-f]*'
      )
    );
  `,
  `
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
  `,
] as const;

const REGULAR_INDEX_STATEMENTS = [
  'CREATE INDEX IF NOT EXISTS chapters_content_hash_idx ON chapters(content_hash);',
  'CREATE INDEX IF NOT EXISTS ai_views_book_chapter_idx ON ai_views(book_id, chapter_index);',
] as const;

const SEARCH_TRIGGER_STATEMENTS = [
  `
    CREATE TRIGGER IF NOT EXISTS books_ai AFTER INSERT ON books BEGIN
      INSERT INTO books_search_v(id, title, author)
      VALUES (new.id, new.title, new.author);
    END;
  `,
  `
    CREATE TRIGGER IF NOT EXISTS books_ad AFTER DELETE ON books BEGIN
      DELETE FROM books_search_v WHERE id = old.id;
    END;
  `,
  `
    CREATE TRIGGER IF NOT EXISTS books_au AFTER UPDATE ON books BEGIN
      UPDATE books_search_v
      SET title = new.title, author = new.author
      WHERE id = new.id;
    END;
  `,
] as const;

export interface ChapterIntegrityResult {
  deduplicatedChapters: number;
  uniqueIndexReady: true;
}

export type DatabasePreparationResult = ChapterIntegrityResult;

function isSqliteInteger(value: unknown, expected: number): boolean {
  return value === expected || value === BigInt(expected);
}

async function assertChapterUniqueIndex(client: Client): Promise<void> {
  const indexes = await client.execute("PRAGMA index_list('chapters');");
  const targetIndex = indexes.rows.find(
    (row) => row.name === CHAPTER_UNIQUE_INDEX,
  );
  const isUnique = isSqliteInteger(targetIndex?.unique, 1);
  const isPartial = !isSqliteInteger(targetIndex?.partial, 0);

  const indexInfo = await client.execute(
    `PRAGMA index_info('${CHAPTER_UNIQUE_INDEX}');`,
  );
  const columns = [...indexInfo.rows]
    .sort((left, right) => Number(left.seqno) - Number(right.seqno))
    .map((row) => row.name);
  const hasExpectedColumns =
    columns.length === CHAPTER_UNIQUE_COLUMNS.length &&
    CHAPTER_UNIQUE_COLUMNS.every(
      (column, position) => columns[position] === column,
    );

  if (!targetIndex || !isUnique || isPartial || !hasExpectedColumns) {
    throw new Error(
      `Invalid SQLite index ${CHAPTER_UNIQUE_INDEX}: expected a non-partial UNIQUE index on (book_id, index)`,
    );
  }
}

async function ensureBookColumns(client: Client): Promise<void> {
  const tableInfo = await client.execute("PRAGMA table_info('books');");
  const columns = new Set(tableInfo.rows.map((row) => row.name));

  if (!columns.has('last_read_progress')) {
    await client.execute(
      'ALTER TABLE books ADD COLUMN last_read_progress TEXT;',
    );
  }

  if (!columns.has('source_folder_id')) {
    await client.execute('ALTER TABLE books ADD COLUMN source_folder_id TEXT;');
  }
}

async function searchIndexNeedsRebuild(client: Client): Promise<boolean> {
  const state = await client.execute(`
    SELECT
      (SELECT COUNT(*) FROM books) AS book_count,
      (SELECT COUNT(*) FROM books_search_v) AS search_count,
      (SELECT COUNT(DISTINCT id) FROM books_search_v) AS distinct_search_ids,
      EXISTS (
        SELECT 1
        FROM (
          SELECT id, title, COALESCE(author, '') AS author
          FROM books
          EXCEPT
          SELECT id, title, COALESCE(author, '') AS author
          FROM books_search_v
        )
      ) AS has_missing_or_stale_book
  `);
  const row = state.rows[0];
  if (!row) {
    throw new Error('Unable to inspect the SQLite search index');
  }

  const bookCount = Number(row.book_count);
  return (
    !Number.isSafeInteger(bookCount) ||
    Number(row.search_count) !== bookCount ||
    Number(row.distinct_search_ids) !== bookCount ||
    !isSqliteInteger(row.has_missing_or_stale_book, 0)
  );
}

async function rebuildSearchIndex(client: Client): Promise<void> {
  await client.execute('BEGIN IMMEDIATE;');

  try {
    await client.execute('DELETE FROM books_search_v;');
    await client.execute(`
      INSERT INTO books_search_v(id, title, author)
      SELECT id, title, author FROM books;
    `);

    if (await searchIndexNeedsRebuild(client)) {
      throw new Error('SQLite search index rebuild did not converge');
    }

    await client.execute('COMMIT;');
  } catch (rebuildError) {
    try {
      await client.execute('ROLLBACK;');
    } catch (rollbackError) {
      throw new AggregateError(
        [rebuildError, rollbackError],
        'Search index rebuild and rollback both failed',
      );
    }

    throw rebuildError;
  }
}

async function prepareSearch(client: Client): Promise<void> {
  await client.execute(`
    CREATE VIRTUAL TABLE IF NOT EXISTS books_search_v USING fts5(
      id UNINDEXED,
      title,
      author
    );
  `);

  for (const statement of SEARCH_TRIGGER_STATEMENTS) {
    await client.execute(statement);
  }

  if (await searchIndexNeedsRebuild(client)) {
    await rebuildSearchIndex(client);
  }
}

export async function ensureChapterIntegrity(
  client: Client,
): Promise<ChapterIntegrityResult> {
  await client.execute('BEGIN IMMEDIATE;');

  try {
    const deletion = await client.execute(`
      DELETE FROM chapters
      WHERE id IN (
        SELECT id FROM (
          SELECT
            id,
            ROW_NUMBER() OVER (
              PARTITION BY book_id, "index"
              ORDER BY created_at DESC, id DESC
            ) AS duplicate_rank
          FROM chapters
        )
        WHERE duplicate_rank > 1
      );
    `);
    await client.execute(`
      CREATE UNIQUE INDEX IF NOT EXISTS chapters_book_id_index_uq
      ON chapters(book_id, "index");
    `);
    await assertChapterUniqueIndex(client);
    await client.execute(`
      UPDATE books
      SET chapter_count = (
        SELECT COUNT(*)
        FROM chapters
        WHERE chapters.book_id = books.id
      )
      WHERE chapter_count != (
        SELECT COUNT(*)
        FROM chapters
        WHERE chapters.book_id = books.id
      );
    `);
    await client.execute('COMMIT;');

    return {
      deduplicatedChapters: deletion.rowsAffected,
      uniqueIndexReady: true,
    };
  } catch (migrationError) {
    try {
      await client.execute('ROLLBACK;');
    } catch (rollbackError) {
      throw new AggregateError(
        [migrationError, rollbackError],
        'Chapter integrity migration and rollback both failed',
      );
    }

    throw migrationError;
  }
}

export async function prepareDatabase(
  client: Client,
): Promise<DatabasePreparationResult> {
  await client.execute('PRAGMA foreign_keys = ON;');

  for (const statement of CORE_TABLE_STATEMENTS) {
    await client.execute(statement);
  }

  await client.execute(`
    INSERT OR IGNORE INTO personal_export_state (id, scope_salt)
    VALUES (1, lower(hex(randomblob(32))));
  `);

  await ensureBookColumns(client);
  const integrity = await ensureChapterIntegrity(client);

  for (const statement of REGULAR_INDEX_STATEMENTS) {
    await client.execute(statement);
  }

  await prepareSearch(client);

  return integrity;
}
