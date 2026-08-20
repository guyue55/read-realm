import type { Client, InStatement, Transaction } from '@libsql/client';
import { LocalFileBlobStorage } from '@reader/storage-core/node';
import { parseTxtBook } from '@reader/parser-core/txt-parser';
import { createHash, randomInt } from 'node:crypto';
import type {
  PublicLibraryBookDto,
  PublicLibraryListQuery,
  PublicLibraryPackage,
  PublicLibraryUpload,
} from './public-library.contract';
import {
  PUBLIC_LIBRARY_PAGE_SIZE,
  type PublicLibraryCatalogPatch,
  type PublicLibraryFacetQuery,
} from './public-library-catalog.contract';
import {
  normalizePublicLibraryRelativePath,
  publicLibraryCollectionPath,
} from './public-library.contract';
import {
  PUBLIC_LIBRARY_CATEGORIES as PUBLIC_LIBRARY_CATEGORY_DEFINITIONS,
  PUBLIC_LIBRARY_TAGS,
  PUBLIC_LIBRARY_TAXONOMY_VERSION,
  requireCategory,
  requireCategoryIdFromLabel,
  requireTagIds,
  tagDtos,
  type PublicLibraryCategoryId,
  type PublicLibraryTagId,
} from './public-library-taxonomy';

function assertCatalogPage(page: number, pageSize: number) {
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > PUBLIC_LIBRARY_PAGE_SIZE
  ) {
    throw new Error('PUBLIC_LIBRARY_CATALOG_PAGE_INVALID');
  }
}

function sha256(value: string | Buffer) {
  return createHash('sha256').update(value).digest('hex');
}

function requireString(value: unknown, errorCode: string) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(errorCode);
  }
  return value;
}

function isSqliteBusy(error: unknown) {
  return (
    (typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'SQLITE_BUSY') ||
    (error instanceof Error &&
      /SQLITE_BUSY|database is locked/i.test(error.message))
  );
}

async function retrySqliteBusy<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isSqliteBusy(error)) throw error;
      lastError = error;
      const baseDelay = 4 * 2 ** attempt;
      await new Promise((resolve) =>
        setTimeout(resolve, baseDelay + randomInt(baseDelay + 1)),
      );
    }
  }
  throw lastError;
}

export class PublicLibraryDuplicateMetadataError extends Error {
  readonly code = 'duplicate_metadata_conflict';

  constructor(readonly existingBookId: string) {
    super('PUBLIC_LIBRARY_DUPLICATE_METADATA_CONFLICT');
    this.name = 'PublicLibraryDuplicateMetadataError';
  }
}

export class PublicLibraryCatalogMetadataStaleError extends Error {
  readonly code = 'CATALOG_METADATA_VERSION_STALE';

  constructor(readonly currentMetadataVersion: number) {
    super('PUBLIC_LIBRARY_CATALOG_METADATA_STALE');
    this.name = 'PublicLibraryCatalogMetadataStaleError';
  }
}

export class PublicLibraryBookNotFoundError extends Error {
  readonly code = 'PUBLIC_LIBRARY_BOOK_NOT_FOUND';

  constructor() {
    super('PUBLIC_LIBRARY_BOOK_NOT_FOUND');
    this.name = 'PublicLibraryBookNotFoundError';
  }
}

export interface PublicLibraryPublicationResult {
  outcome: 'created' | 'unchanged';
  book: PublicLibraryBookDto;
}

function canonicalPackage(value: PublicLibraryPackage) {
  return JSON.stringify(value);
}

function optionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

function parseStoredTagIds(value: unknown) {
  if (typeof value !== 'string' || !value) return [];
  return requireTagIds(value.split('\u001f'));
}

function rowToBook(row: Record<string, unknown>): PublicLibraryBookDto {
  const category = requireCategory(row.category_id);
  const tags = parseStoredTagIds(row.tag_ids);
  const maintainerId = requireString(
    row.maintainer_id,
    'PUBLIC_LIBRARY_MAINTAINER_ID_MISSING',
  );
  const maintainerLabel = requireString(
    row.maintainer_label,
    'PUBLIC_LIBRARY_MAINTAINER_LABEL_MISSING',
  );
  return {
    id: String(row.id),
    title: String(row.title),
    author: optionalText(row.author),
    description: optionalText(row.description),
    format: 'txt',
    taxonomyVersion: PUBLIC_LIBRARY_TAXONOMY_VERSION,
    categoryId: category.id,
    category: category.label,
    tags: tagDtos(tags),
    maintainerId,
    maintainerLabel,
    metadataVersion: Number(row.metadata_version),
    collectionPath: optionalText(row.collection_path),
    chapterCount: Number(row.chapter_count),
    wordCount: Number(row.word_count),
    contentHash: String(row.content_hash),
    publishedAt: String(row.published_at),
  };
}

const BOOK_SELECT = `SELECT b.*, m.label AS maintainer_label,
  COALESCE(GROUP_CONCAT(t.tag_id, char(31)), '') AS tag_ids
  FROM public_books b
  JOIN public_maintainers m ON m.maintainer_id = b.maintainer_id
  LEFT JOIN public_book_tags t ON t.book_id = b.id`;

function ingestMetadataHash(input: {
  title: string;
  author?: string;
  description?: string;
  categoryId: PublicLibraryCategoryId;
  collectionPath: string;
  tagIds: readonly PublicLibraryTagId[];
}) {
  return sha256(
    JSON.stringify({
      title: input.title,
      author: input.author ?? null,
      description: input.description ?? null,
      categoryId: input.categoryId,
      collectionPath: input.collectionPath,
      tagIds: [...input.tagIds].sort(),
    }),
  );
}

function buildSearchMatch(value: string) {
  const normalized = normalizeSearchValue(value);
  return normalized ? `"${normalized.replaceAll('"', '""')}"` : '';
}

function normalizeSearchValue(value: string) {
  return value.normalize('NFKC').trim().toLocaleLowerCase('en-US');
}

function shortSearchTerms(...values: Array<string | undefined>) {
  const terms = new Set<string>();
  for (const value of values) {
    const normalized = value?.normalize('NFKC').toLocaleLowerCase('en-US');
    if (!normalized) continue;
    const characters = [...normalized];
    for (let index = 0; index < characters.length; index += 1) {
      terms.add(characters[index] ?? '');
      if (index + 1 < characters.length) {
        terms.add(`${characters[index]}${characters[index + 1]}`);
      }
    }
  }
  terms.delete('');
  return [...terms];
}

const SQL_CATEGORY_IDS = PUBLIC_LIBRARY_CATEGORY_DEFINITIONS.map(
  ({ id }) => `'${id}'`,
).join(', ');
const SQL_CATEGORY_LABELS = PUBLIC_LIBRARY_CATEGORY_DEFINITIONS.map(
  ({ label }) => `'${label}'`,
).join(', ');

async function ensureColumn(
  client: Client | Transaction,
  table: 'public_books' | 'public_catalog_state' | 'public_sources',
  name: string,
  definition: string,
) {
  const columns = await client.execute(`PRAGMA table_info(${table})`);
  if (columns.rows.some((row) => row.name === name)) return;
  try {
    await client.execute(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  } catch (error) {
    if (
      error instanceof Error &&
      /duplicate column name/i.test(error.message)
    ) {
      const refreshed = await client.execute(`PRAGMA table_info(${table})`);
      if (refreshed.rows.some((row) => row.name === name)) return;
    }
    throw error;
  }
}

async function preparePublicLibraryDatabaseOnce(client: Client | Transaction) {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS public_books (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      author TEXT,
      description TEXT,
      format TEXT NOT NULL CHECK(format = 'txt'),
      category TEXT NOT NULL,
      chapter_count INTEGER NOT NULL,
      word_count INTEGER NOT NULL,
      content_hash TEXT NOT NULL,
      package_hash TEXT NOT NULL UNIQUE,
      published_at TEXT NOT NULL
    )
  `);
  await ensureColumn(
    client,
    'public_books',
    'edition_hash',
    'edition_hash TEXT',
  );
  await ensureColumn(client, 'public_books', 'source_hash', 'source_hash TEXT');
  await ensureColumn(
    client,
    'public_books',
    'maintainer_id',
    'maintainer_id TEXT',
  );
  await ensureColumn(
    client,
    'public_books',
    'collection_path',
    "collection_path TEXT NOT NULL DEFAULT ''",
  );
  await ensureColumn(
    client,
    'public_books',
    'metadata_version',
    'metadata_version INTEGER NOT NULL DEFAULT 1',
  );
  await ensureColumn(
    client,
    'public_books',
    'created_revision',
    'created_revision INTEGER NOT NULL DEFAULT 0',
  );
  await ensureColumn(
    client,
    'public_books',
    'category_id',
    `category_id TEXT NOT NULL DEFAULT 'other' CHECK(category_id IN (${SQL_CATEGORY_IDS}))`,
  );
  await ensureColumn(
    client,
    'public_books',
    'ingest_category_id',
    `ingest_category_id TEXT NOT NULL DEFAULT 'other' CHECK(ingest_category_id IN (${SQL_CATEGORY_IDS}))`,
  );
  await ensureColumn(
    client,
    'public_books',
    'ingest_metadata_hash',
    "ingest_metadata_hash TEXT NOT NULL DEFAULT ''",
  );
  await client.execute(`
    CREATE TABLE IF NOT EXISTS public_catalog_state (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      revision INTEGER NOT NULL CHECK(revision >= 0)
    )
  `);
  await client.execute(
    'INSERT OR IGNORE INTO public_catalog_state (id, revision) VALUES (1, 0)',
  );
  await client.execute(`
    CREATE TABLE IF NOT EXISTS public_taxonomy_state (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      template_version TEXT NOT NULL
    )
  `);
  await client.execute({
    sql: `INSERT OR IGNORE INTO public_taxonomy_state (id, template_version)
      VALUES (1, ?)`,
    args: [PUBLIC_LIBRARY_TAXONOMY_VERSION],
  });
  await client.execute(`
    CREATE TABLE IF NOT EXISTS public_categories (
      category_id TEXT PRIMARY KEY,
      label TEXT NOT NULL UNIQUE,
      sort_order INTEGER NOT NULL UNIQUE,
      template_version TEXT NOT NULL
    )
  `);
  await client.execute(`
    CREATE TABLE IF NOT EXISTS public_tags (
      tag_id TEXT PRIMARY KEY,
      label TEXT NOT NULL UNIQUE,
      sort_order INTEGER NOT NULL UNIQUE,
      template_version TEXT NOT NULL
    )
  `);
  for (const [
    sortOrder,
    category,
  ] of PUBLIC_LIBRARY_CATEGORY_DEFINITIONS.entries()) {
    await client.execute({
      sql: `INSERT OR IGNORE INTO public_categories
        (category_id, label, sort_order, template_version) VALUES (?, ?, ?, ?)`,
      args: [
        category.id,
        category.label,
        sortOrder,
        PUBLIC_LIBRARY_TAXONOMY_VERSION,
      ],
    });
  }
  for (const [sortOrder, tag] of PUBLIC_LIBRARY_TAGS.entries()) {
    await client.execute({
      sql: `INSERT OR IGNORE INTO public_tags
        (tag_id, label, sort_order, template_version) VALUES (?, ?, ?, ?)`,
      args: [tag.id, tag.label, sortOrder, PUBLIC_LIBRARY_TAXONOMY_VERSION],
    });
  }
  const [taxonomyState, categoryRows, tagRows] = await Promise.all([
    client.execute(
      'SELECT template_version FROM public_taxonomy_state WHERE id = 1',
    ),
    client.execute(
      'SELECT category_id, label, sort_order, template_version FROM public_categories ORDER BY sort_order',
    ),
    client.execute(
      'SELECT tag_id, label, sort_order, template_version FROM public_tags ORDER BY sort_order',
    ),
  ]);
  if (
    taxonomyState.rows[0]?.template_version !==
      PUBLIC_LIBRARY_TAXONOMY_VERSION ||
    JSON.stringify(categoryRows.rows) !==
      JSON.stringify(
        PUBLIC_LIBRARY_CATEGORY_DEFINITIONS.map((item, sortOrder) => ({
          category_id: item.id,
          label: item.label,
          sort_order: sortOrder,
          template_version: PUBLIC_LIBRARY_TAXONOMY_VERSION,
        })),
      ) ||
    JSON.stringify(tagRows.rows) !==
      JSON.stringify(
        PUBLIC_LIBRARY_TAGS.map((item, sortOrder) => ({
          tag_id: item.id,
          label: item.label,
          sort_order: sortOrder,
          template_version: PUBLIC_LIBRARY_TAXONOMY_VERSION,
        })),
      )
  ) {
    throw new Error('PUBLIC_LIBRARY_TAXONOMY_DRIFT');
  }
  await client.execute(`
    CREATE TABLE IF NOT EXISTS public_maintainers (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      maintainer_id TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL
    )
  `);
  await client.execute(`
    INSERT OR IGNORE INTO public_maintainers (id, maintainer_id, label)
    VALUES (1, lower(hex(randomblob(16))), '本阁维护者')
  `);
  const maintainer = await client.execute(
    'SELECT maintainer_id, label FROM public_maintainers WHERE id = 1',
  );
  const maintainerId = requireString(
    maintainer.rows[0]?.maintainer_id,
    'PUBLIC_LIBRARY_MAINTAINER_ID_MISSING',
  );
  if (
    !/^[a-f0-9]{32}$/u.test(maintainerId) ||
    maintainer.rows[0]?.label !== '本阁维护者'
  ) {
    throw new Error('PUBLIC_LIBRARY_MAINTAINER_DRIFT');
  }
  await client.execute({
    sql: `UPDATE public_books
      SET source_hash = COALESCE(source_hash, content_hash),
          maintainer_id = COALESCE(maintainer_id, ?)`,
    args: [maintainerId],
  });
  const unknownLegacyCategory = await client.execute(`SELECT id
    FROM public_books WHERE category NOT IN (${SQL_CATEGORY_LABELS}) LIMIT 1`);
  if (unknownLegacyCategory.rows.length > 0) {
    throw new Error('PUBLIC_LIBRARY_CATEGORY_MIGRATION_FAILED');
  }
  for (const category of PUBLIC_LIBRARY_CATEGORY_DEFINITIONS) {
    await client.execute({
      sql: `UPDATE public_books SET category_id = ?,
        ingest_category_id = CASE WHEN ingest_metadata_hash = '' THEN ?
          ELSE ingest_category_id END
        WHERE category = ?`,
      args: [category.id, category.id, category.label],
    });
  }
  const invalidCategory = await client.execute(`SELECT id FROM public_books
    WHERE category_id NOT IN (${SQL_CATEGORY_IDS})
      OR ingest_category_id NOT IN (${SQL_CATEGORY_IDS}) OR NOT EXISTS (
      SELECT 1 FROM public_categories c
      WHERE c.category_id = public_books.category_id
        AND c.label = public_books.category
    ) OR NOT EXISTS (
      SELECT 1 FROM public_categories ingest
      WHERE ingest.category_id = public_books.ingest_category_id
    ) LIMIT 1`);
  if (invalidCategory.rows.length > 0) {
    throw new Error('PUBLIC_LIBRARY_CATEGORY_MIGRATION_FAILED');
  }
  await client.execute(`
    CREATE TABLE IF NOT EXISTS public_editions (
      edition_hash TEXT PRIMARY KEY,
      package_hash TEXT NOT NULL UNIQUE,
      content_hash TEXT NOT NULL,
      chapter_count INTEGER NOT NULL,
      word_count INTEGER NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
  await client.execute(`
    CREATE TABLE IF NOT EXISTS public_sources (
      source_id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL REFERENCES public_books(id),
      source_kind TEXT NOT NULL,
      source_scope TEXT NOT NULL,
      relative_path TEXT NOT NULL,
      source_hash TEXT NOT NULL,
      scan_id TEXT,
      scan_lease_owner TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(source_kind, source_scope, relative_path, source_hash)
    )
  `);
  await ensureColumn(client, 'public_sources', 'scan_id', 'scan_id TEXT');
  await ensureColumn(
    client,
    'public_sources',
    'scan_lease_owner',
    'scan_lease_owner TEXT',
  );
  await client.execute(`
    CREATE TABLE IF NOT EXISTS public_ingest_receipts (
      receipt_key TEXT PRIMARY KEY,
      book_id TEXT NOT NULL REFERENCES public_books(id),
      edition_hash TEXT NOT NULL REFERENCES public_editions(edition_hash),
      source_hash TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status = 'succeeded'),
      created_at TEXT NOT NULL
    )
  `);
  await client.execute(`
    CREATE TABLE IF NOT EXISTS public_book_tags (
      book_id TEXT NOT NULL REFERENCES public_books(id),
      tag_id TEXT NOT NULL REFERENCES public_tags(tag_id),
      PRIMARY KEY(book_id, tag_id)
    )
  `);
  await client.execute(`
    CREATE TRIGGER IF NOT EXISTS public_book_tags_template_guard_insert
    BEFORE INSERT ON public_book_tags
    WHEN NOT EXISTS (SELECT 1 FROM public_tags WHERE tag_id = NEW.tag_id)
    BEGIN SELECT RAISE(ABORT, 'PUBLIC_LIBRARY_TAG_INVALID'); END
  `);
  await client.execute(`
    CREATE TRIGGER IF NOT EXISTS public_book_tags_template_guard_update
    BEFORE UPDATE OF tag_id ON public_book_tags
    WHEN NOT EXISTS (SELECT 1 FROM public_tags WHERE tag_id = NEW.tag_id)
    BEGIN SELECT RAISE(ABORT, 'PUBLIC_LIBRARY_TAG_INVALID'); END
  `);
  await client.execute(`
    CREATE TRIGGER IF NOT EXISTS public_book_tags_count_guard_insert
    BEFORE INSERT ON public_book_tags
    WHEN NOT EXISTS (
      SELECT 1 FROM public_book_tags
      WHERE book_id = NEW.book_id AND tag_id = NEW.tag_id
    ) AND (
      SELECT COUNT(*) FROM public_book_tags WHERE book_id = NEW.book_id
    ) >= 5
    BEGIN SELECT RAISE(ABORT, 'PUBLIC_LIBRARY_TAG_LIMIT_EXCEEDED'); END
  `);
  await client.execute(`
    CREATE TRIGGER IF NOT EXISTS public_book_tags_count_guard_update
    BEFORE UPDATE OF book_id, tag_id ON public_book_tags
    WHEN (
      SELECT COUNT(*) FROM public_book_tags
      WHERE book_id = NEW.book_id
        AND NOT (book_id = OLD.book_id AND tag_id = OLD.tag_id)
    ) >= 5
    BEGIN SELECT RAISE(ABORT, 'PUBLIC_LIBRARY_TAG_LIMIT_EXCEEDED'); END
  `);
  const excessiveTags = await client.execute(`SELECT book_id
    FROM public_book_tags GROUP BY book_id HAVING COUNT(*) > 5 LIMIT 1`);
  if (excessiveTags.rows.length > 0) {
    throw new Error('PUBLIC_LIBRARY_TAG_LIMIT_MIGRATION_FAILED');
  }
  const invalidStoredTag = await client.execute(`SELECT bt.book_id
    FROM public_book_tags bt
    LEFT JOIN public_tags t ON t.tag_id = bt.tag_id
    WHERE t.tag_id IS NULL LIMIT 1`);
  if (invalidStoredTag.rows.length > 0) {
    throw new Error('PUBLIC_LIBRARY_TAG_MIGRATION_FAILED');
  }
  await client.execute(`
    CREATE TRIGGER IF NOT EXISTS public_books_category_guard_insert
    BEFORE INSERT ON public_books
    WHEN NOT EXISTS (
      SELECT 1 FROM public_categories WHERE category_id = NEW.category_id
    )
    BEGIN SELECT RAISE(ABORT, 'PUBLIC_LIBRARY_CATEGORY_INVALID'); END
  `);
  await client.execute(`
    CREATE TRIGGER IF NOT EXISTS public_books_category_guard_update
    BEFORE UPDATE OF category_id ON public_books
    WHEN NOT EXISTS (
      SELECT 1 FROM public_categories WHERE category_id = NEW.category_id
    )
    BEGIN SELECT RAISE(ABORT, 'PUBLIC_LIBRARY_CATEGORY_INVALID'); END
  `);
  await client.execute(`
    CREATE TRIGGER IF NOT EXISTS public_books_ingest_category_guard_insert
    BEFORE INSERT ON public_books
    WHEN NOT EXISTS (
      SELECT 1 FROM public_categories
      WHERE category_id = NEW.ingest_category_id
    )
    BEGIN SELECT RAISE(ABORT, 'PUBLIC_LIBRARY_INGEST_CATEGORY_INVALID'); END
  `);
  await client.execute(`
    CREATE TRIGGER IF NOT EXISTS public_books_ingest_category_guard_update
    BEFORE UPDATE OF ingest_category_id ON public_books
    WHEN NOT EXISTS (
      SELECT 1 FROM public_categories
      WHERE category_id = NEW.ingest_category_id
    )
    BEGIN SELECT RAISE(ABORT, 'PUBLIC_LIBRARY_INGEST_CATEGORY_INVALID'); END
  `);
  await client.execute(`
    CREATE TRIGGER IF NOT EXISTS public_books_category_consistency_insert
    BEFORE INSERT ON public_books
    WHEN NOT EXISTS (
      SELECT 1 FROM public_categories
      WHERE category_id = NEW.category_id AND label = NEW.category
    )
    BEGIN SELECT RAISE(ABORT, 'PUBLIC_LIBRARY_CATEGORY_MISMATCH'); END
  `);
  await client.execute(`
    CREATE TRIGGER IF NOT EXISTS public_books_category_consistency_update
    BEFORE UPDATE OF category, category_id ON public_books
    WHEN NOT EXISTS (
      SELECT 1 FROM public_categories
      WHERE category_id = NEW.category_id AND label = NEW.category
    )
    BEGIN SELECT RAISE(ABORT, 'PUBLIC_LIBRARY_CATEGORY_MISMATCH'); END
  `);
  const ingestRows = await client.execute(`SELECT b.id, b.title, b.author,
    b.description, b.ingest_category_id, b.collection_path,
    COALESCE(GROUP_CONCAT(t.tag_id, char(31)), '') AS tag_ids,
    b.ingest_metadata_hash
    FROM public_books b
    LEFT JOIN public_book_tags t ON t.book_id = b.id
    GROUP BY b.id`);
  for (const row of ingestRows.rows) {
    if (
      typeof row.ingest_metadata_hash === 'string' &&
      row.ingest_metadata_hash
    )
      continue;
    const category = requireCategory(row.ingest_category_id);
    const tagIds = parseStoredTagIds(row.tag_ids);
    await client.execute({
      sql: 'UPDATE public_books SET ingest_metadata_hash = ? WHERE id = ?',
      args: [
        ingestMetadataHash({
          title: requireString(row.title, 'PUBLIC_LIBRARY_TITLE_MISSING'),
          author: optionalText(row.author),
          description: optionalText(row.description),
          categoryId: category.id,
          collectionPath: optionalText(row.collection_path) ?? '',
          tagIds,
        }),
        requireString(row.id, 'PUBLIC_LIBRARY_BOOK_ID_MISSING'),
      ],
    });
  }
  await client.execute(`
    CREATE TABLE IF NOT EXISTS public_scan_root_state (
      root_id TEXT PRIMARY KEY,
      config_fingerprint TEXT NOT NULL,
      next_generation INTEGER NOT NULL CHECK(next_generation > 0),
      last_completed_generation INTEGER NOT NULL DEFAULT 0
    )
  `);
  await client.execute(`
    CREATE TABLE IF NOT EXISTS public_scan_generations (
      scan_id TEXT PRIMARY KEY,
      root_id TEXT NOT NULL,
      root_label TEXT NOT NULL,
      generation INTEGER NOT NULL,
      config_fingerprint TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN (
        'running', 'completed', 'completed_with_errors', 'failed', 'interrupted'
      )),
      lease_owner TEXT NOT NULL,
      lease_expires_at TEXT NOT NULL,
      heartbeat_at TEXT NOT NULL,
      discovered_count INTEGER NOT NULL DEFAULT 0,
      processed_count INTEGER NOT NULL DEFAULT 0,
      created_count INTEGER NOT NULL DEFAULT 0,
      unchanged_count INTEGER NOT NULL DEFAULT 0,
      duplicate_count INTEGER NOT NULL DEFAULT 0,
      failed_count INTEGER NOT NULL DEFAULT 0,
      skipped_count INTEGER NOT NULL DEFAULT 0,
      total_bytes INTEGER NOT NULL DEFAULT 0,
      error_code TEXT,
      started_at TEXT NOT NULL,
      completed_at TEXT
    )
  `);
  await client.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS public_scan_one_running_per_root
    ON public_scan_generations(root_id) WHERE status = 'running'
  `);
  await client.execute(`
    CREATE TABLE IF NOT EXISTS public_scan_items (
      scan_id TEXT NOT NULL REFERENCES public_scan_generations(scan_id),
      relative_path TEXT NOT NULL,
      source_hash TEXT,
      book_id TEXT,
      outcome TEXT NOT NULL CHECK(outcome IN (
        'created', 'unchanged', 'duplicate', 'failed', 'skipped'
      )),
      error_code TEXT,
      PRIMARY KEY(scan_id, relative_path)
    )
  `);
  await client.execute(`
    CREATE TABLE IF NOT EXISTS public_scan_source_state (
      root_id TEXT NOT NULL,
      relative_path TEXT NOT NULL,
      source_hash TEXT NOT NULL,
      book_id TEXT NOT NULL REFERENCES public_books(id),
      status TEXT NOT NULL CHECK(status IN ('active', 'missing')),
      first_seen_generation INTEGER NOT NULL,
      last_seen_generation INTEGER NOT NULL,
      PRIMARY KEY(root_id, relative_path, source_hash)
    )
  `);
  await client.execute(`
    CREATE TRIGGER IF NOT EXISTS public_scan_publication_fence
    BEFORE INSERT ON public_sources
    WHEN NEW.source_kind = 'maintenance_scan' AND NOT EXISTS (
      SELECT 1 FROM public_scan_generations g
      WHERE g.scan_id = NEW.scan_id
        AND g.lease_owner = NEW.scan_lease_owner
        AND g.status = 'running'
        AND g.lease_expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    )
    BEGIN
      SELECT RAISE(ABORT, 'PUBLIC_LIBRARY_SCAN_FENCE_INVALID');
    END
  `);
  await client.execute(
    'CREATE UNIQUE INDEX IF NOT EXISTS public_books_edition_hash_unique ON public_books(edition_hash) WHERE edition_hash IS NOT NULL',
  );
  await client.execute(
    'CREATE INDEX IF NOT EXISTS public_books_category_published_idx ON public_books(category, published_at DESC, id ASC)',
  );
  await client.execute(
    'CREATE INDEX IF NOT EXISTS public_books_category_id_published_idx ON public_books(category_id, published_at DESC, id ASC)',
  );
  await client.execute(
    'CREATE INDEX IF NOT EXISTS public_books_maintainer_published_idx ON public_books(maintainer_id, published_at DESC, id ASC)',
  );
  await client.execute(
    'CREATE INDEX IF NOT EXISTS public_book_tags_tag_book_idx ON public_book_tags(tag_id, book_id)',
  );
  await client.execute(`CREATE VIRTUAL TABLE IF NOT EXISTS public_books_search_v3
    USING fts5(book_id UNINDEXED, title, author, maintainer_label,
      tokenize = 'trigram')`);
  await client.execute(`CREATE TABLE IF NOT EXISTS public_book_search_terms (
    book_id TEXT NOT NULL REFERENCES public_books(id) ON DELETE CASCADE,
    term TEXT NOT NULL,
    PRIMARY KEY(book_id, term)
  )`);
  await client.execute(
    'CREATE INDEX IF NOT EXISTS public_book_search_terms_term_book_idx ON public_book_search_terms(term, book_id)',
  );
  await client.execute('DELETE FROM public_books_search_v3');
  await client.execute('DELETE FROM public_book_search_terms');
  const searchableBooks = await client.execute(`SELECT b.id,
      b.title, b.author, m.label AS maintainer_label FROM public_books b
      JOIN public_maintainers m ON m.maintainer_id = b.maintainer_id`);
  for (const row of searchableBooks.rows) {
    const bookId = requireString(row.id, 'PUBLIC_LIBRARY_BOOK_ID_MISSING');
    await client.execute({
      sql: `INSERT INTO public_books_search_v3
          (book_id, title, author, maintainer_label) VALUES (?, ?, ?, ?)`,
      args: [
        bookId,
        normalizeSearchValue(
          requireString(row.title, 'PUBLIC_LIBRARY_TITLE_MISSING'),
        ),
        normalizeSearchValue(optionalText(row.author) ?? ''),
        normalizeSearchValue(
          requireString(
            row.maintainer_label,
            'PUBLIC_LIBRARY_MAINTAINER_LABEL_MISSING',
          ),
        ),
      ],
    });
    for (const term of shortSearchTerms(
      optionalText(row.title),
      optionalText(row.author),
      optionalText(row.maintainer_label),
    )) {
      await client.execute({
        sql: 'INSERT INTO public_book_search_terms (book_id, term) VALUES (?, ?)',
        args: [bookId, term],
      });
    }
  }
  const existing = await client.execute(
    'SELECT COUNT(*) AS total FROM public_books',
  );
  if (Number(existing.rows[0]?.total ?? 0) > 0) {
    await client.execute(
      'UPDATE public_catalog_state SET revision = MAX(revision, 1) WHERE id = 1',
    );
  }
}

export async function preparePublicLibraryDatabase(client: Client) {
  await client.execute('PRAGMA foreign_keys = ON');
  await retrySqliteBusy(() => client.execute('PRAGMA journal_mode = WAL'));
  await retrySqliteBusy(async () => {
    const transaction = await client.transaction('write');
    try {
      await preparePublicLibraryDatabaseOnce(transaction);
      await transaction.commit();
    } catch (error) {
      await transaction.rollback().catch(() => undefined);
      throw error;
    }
  });
}

export type PublicLibrarySourceKind =
  | 'legacy_json'
  | 'browser_file'
  | 'maintenance_scan'
  | 'personal_cloud';

export interface CanonicalPublicBookCandidate {
  title: string;
  author?: string;
  description?: string;
  category: PublicLibraryBookDto['category'];
  tagIds?: readonly PublicLibraryTagId[];
  collectionPath?: string;
  source: {
    kind: PublicLibrarySourceKind;
    scope: string;
    relativePath: string;
    bytes: Buffer;
  };
  chapters: Array<{ index: number; title: string; content: string }>;
  wordCount: number;
  publicationFence?: { scanId: string; leaseOwner: string };
}

interface PreparedCandidate {
  title: string;
  author?: string;
  description?: string;
  category: PublicLibraryBookDto['category'];
  categoryId: PublicLibraryCategoryId;
  tagIds: PublicLibraryTagId[];
  ingestMetadataHash: string;
  collectionPath: string;
  sourceHash: string;
  editionHash: string;
  sourceId: string;
  receiptKey: string;
  sourceKind: PublicLibrarySourceKind;
  sourceScope: string;
  relativePath: string;
  chapters: PublicLibraryPackage['chapters'];
  wordCount: number;
  publicationFence?: { scanId: string; leaseOwner: string };
}

interface PreparedPublication {
  candidate: PreparedCandidate;
  book: PublicLibraryBookDto;
  packageHash: string;
}

export class PublicLibraryRepository {
  private readonly inFlightByEdition = new Map<
    string,
    Promise<PublicLibraryPublicationResult>
  >();

  constructor(
    private readonly client: Client,
    private readonly blobs: LocalFileBlobStorage,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  private async findByEdition(
    editionHash: string,
  ): Promise<Record<string, unknown> | undefined> {
    const result = await this.client.execute({
      sql: `${BOOK_SELECT} WHERE b.edition_hash = ? GROUP BY b.id LIMIT 1`,
      args: [editionHash],
    });
    return result.rows[0];
  }

  private assertMetadata(
    row: Record<string, unknown>,
    candidate: PreparedCandidate,
  ) {
    const book = rowToBook(row);
    if (row.ingest_metadata_hash !== candidate.ingestMetadataHash) {
      throw new PublicLibraryDuplicateMetadataError(book.id);
    }
    return book;
  }

  private sourceFactStatements(
    bookId: string,
    candidate: PreparedCandidate,
    createdAt: string,
  ): InStatement[] {
    return [
      {
        sql: `INSERT OR IGNORE INTO public_sources (
          source_id, book_id, source_kind, source_scope, relative_path,
          source_hash, scan_id, scan_lease_owner, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          candidate.sourceId,
          bookId,
          candidate.sourceKind,
          candidate.sourceScope,
          candidate.relativePath,
          candidate.sourceHash,
          candidate.publicationFence?.scanId ?? null,
          candidate.publicationFence?.leaseOwner ?? null,
          createdAt,
        ],
      },
      {
        sql: `INSERT OR IGNORE INTO public_ingest_receipts (
          receipt_key, book_id, edition_hash, source_hash, status, created_at
        ) VALUES (?, ?, ?, ?, 'succeeded', ?)`,
        args: [
          candidate.receiptKey,
          bookId,
          candidate.editionHash,
          candidate.sourceHash,
          createdAt,
        ],
      },
      {
        sql: `SELECT s.book_id AS source_book_id,
          s.source_hash AS saved_source_hash,
          r.book_id AS receipt_book_id,
          r.edition_hash AS receipt_edition_hash,
          r.status AS receipt_status
          FROM public_sources s
          JOIN public_ingest_receipts r ON r.receipt_key = ?
          WHERE s.source_id = ? LIMIT 1`,
        args: [candidate.receiptKey, candidate.sourceId],
      },
    ];
  }

  private assertSourceReadback(
    row: Record<string, unknown> | undefined,
    bookId: string,
    candidate: PreparedCandidate,
  ) {
    if (
      row?.source_book_id !== bookId ||
      row.saved_source_hash !== candidate.sourceHash ||
      row.receipt_book_id !== bookId ||
      row.receipt_edition_hash !== candidate.editionHash ||
      row.receipt_status !== 'succeeded'
    ) {
      throw new Error('PUBLIC_LIBRARY_SOURCE_READBACK_FAILED');
    }
  }

  private async attachSourceToExisting(
    bookId: string,
    candidate: PreparedCandidate,
  ) {
    return retrySqliteBusy(async () => {
      const existing = await this.findByEdition(candidate.editionHash);
      if (
        !existing ||
        requireString(existing.id, 'PUBLIC_LIBRARY_BOOK_ID_MISSING') !== bookId
      ) {
        throw new Error('PUBLIC_LIBRARY_EDITION_NOT_FOUND');
      }
      this.assertMetadata(existing, candidate);
      const results = await this.client.batch(
        [
          {
            sql: `${BOOK_SELECT} WHERE b.id = ? AND b.edition_hash = ?
              GROUP BY b.id LIMIT 1`,
            args: [bookId, candidate.editionHash],
          },
          ...this.sourceFactStatements(bookId, candidate, this.now()),
        ],
        'write',
      );
      const currentRow = results[0]?.rows[0] as
        | Record<string, unknown>
        | undefined;
      if (!currentRow) throw new Error('PUBLIC_LIBRARY_EDITION_NOT_FOUND');
      const currentBook = this.assertMetadata(currentRow, candidate);
      this.assertSourceReadback(
        results.at(-1)?.rows[0],
        currentBook.id,
        candidate,
      );
      return currentBook;
    });
  }

  private async upgradeLegacyBook(
    legacyId: string,
    candidate: PreparedCandidate,
  ): Promise<PublicLibraryBookDto | undefined> {
    return retrySqliteBusy(() =>
      this.upgradeLegacyBookOnce(legacyId, candidate),
    );
  }

  private async upgradeLegacyBookOnce(
    legacyId: string,
    candidate: PreparedCandidate,
  ): Promise<PublicLibraryBookDto | undefined> {
    const legacyResult = await this.client.execute({
      sql: `${BOOK_SELECT} WHERE b.id = ? GROUP BY b.id LIMIT 1`,
      args: [legacyId],
    });
    const legacyRow = legacyResult.rows[0] as
      | Record<string, unknown>
      | undefined;
    if (!legacyRow) return undefined;
    const legacyBook = this.assertMetadata(legacyRow, candidate);
    if (legacyRow.content_hash !== candidate.sourceHash) {
      throw new Error('PUBLIC_LIBRARY_ID_CONFLICT');
    }
    if (legacyRow.edition_hash === candidate.editionHash) return legacyBook;
    if (legacyRow.edition_hash) {
      throw new Error('PUBLIC_LIBRARY_ID_CONFLICT');
    }

    const bundle = await this.getPackage(legacyId);
    const storedEditionHash = sha256(
      JSON.stringify(
        bundle.chapters.map((chapter) => ({
          index: chapter.index,
          title: chapter.title,
          content: chapter.content,
        })),
      ),
    );
    if (storedEditionHash !== candidate.editionHash) {
      throw new Error('PUBLIC_LIBRARY_LEGACY_EDITION_MISMATCH');
    }
    const packageHash = requireString(
      legacyRow.package_hash,
      'PUBLIC_LIBRARY_PACKAGE_HASH_MISSING',
    );
    const publishedAt = requireString(
      legacyRow.published_at,
      'PUBLIC_LIBRARY_PUBLISHED_AT_MISSING',
    );

    try {
      const results = await this.client.batch(
        [
          {
            sql: `INSERT INTO public_editions (
              edition_hash, package_hash, content_hash, chapter_count,
              word_count, created_at
            ) VALUES (?, ?, ?, ?, ?, ?)`,
            args: [
              candidate.editionHash,
              packageHash,
              candidate.sourceHash,
              candidate.chapters.length,
              candidate.wordCount,
              publishedAt,
            ],
          },
          {
            sql: `UPDATE public_books SET edition_hash = ?, source_hash = ?,
              maintainer_id = (
                SELECT maintainer_id FROM public_maintainers WHERE id = 1
              ), created_revision = MAX(created_revision, 1)
              WHERE id = ? AND edition_hash IS NULL`,
            args: [candidate.editionHash, candidate.sourceHash, legacyId],
          },
          ...this.sourceFactStatements(legacyId, candidate, publishedAt),
          {
            sql: `SELECT b.*, m.label AS maintainer_label,
              COALESCE(GROUP_CONCAT(t.tag_id, char(31)), '') AS tag_ids
              FROM public_books b
              JOIN public_maintainers m ON m.maintainer_id = b.maintainer_id
              LEFT JOIN public_book_tags t ON t.book_id = b.id
              JOIN public_editions e ON e.edition_hash = b.edition_hash
              JOIN public_sources s ON s.book_id = b.id
              JOIN public_ingest_receipts r ON r.book_id = b.id
              WHERE b.id = ? AND e.package_hash = ? AND r.status = 'succeeded'
              GROUP BY b.id LIMIT 1`,
            args: [legacyId, packageHash],
          },
        ],
        'write',
      );
      this.assertSourceReadback(results.at(-2)?.rows[0], legacyId, candidate);
      const savedRow = results.at(-1)?.rows[0] as
        | Record<string, unknown>
        | undefined;
      if (!savedRow) {
        throw new Error('PUBLIC_LIBRARY_TRANSACTION_READBACK_FAILED');
      }
      return rowToBook(savedRow);
    } catch (error) {
      const existing = await this.findByEdition(candidate.editionHash);
      if (existing) {
        this.assertMetadata(existing, candidate);
        return this.attachSourceToExisting(
          requireString(existing.id, 'PUBLIC_LIBRARY_BOOK_ID_MISSING'),
          candidate,
        );
      }
      throw error;
    }
  }

  async publishTxt(input: PublicLibraryUpload): Promise<PublicLibraryBookDto> {
    const source = Buffer.from(input.content, 'utf8');
    const parsed = parseTxtBook(
      `${input.title}.txt`,
      source.buffer.slice(
        source.byteOffset,
        source.byteOffset + source.byteLength,
      ),
    );
    if (
      parsed.chapters.length === 0 ||
      parsed.chapters.some((chapter) => !chapter.content)
    ) {
      throw new Error('PUBLIC_LIBRARY_TXT_HAS_EMPTY_CHAPTER');
    }
    return this.publishCandidate({
      title: input.title,
      author: input.author,
      description: input.description,
      category: input.category,
      tagIds: input.tagIds,
      source: {
        kind: 'legacy_json',
        scope: 'gate-03-json',
        relativePath: 'legacy-json.txt',
        bytes: source,
      },
      chapters: parsed.chapters.map((chapter) => ({
        index: chapter.index,
        title: chapter.title,
        content: chapter.content,
      })),
      wordCount: [...input.content].length,
    });
  }

  async publishCandidate(
    input: CanonicalPublicBookCandidate,
  ): Promise<PublicLibraryBookDto> {
    return (await this.publishCandidateWithOutcome(input)).book;
  }

  async publishCandidateWithOutcome(
    input: CanonicalPublicBookCandidate,
  ): Promise<PublicLibraryPublicationResult> {
    const normalizedSourcePath = normalizePublicLibraryRelativePath(
      input.source.relativePath,
      input.source.kind === 'maintenance_scan' ? 32 : 12,
    );
    const derivedCollectionPath = publicLibraryCollectionPath(
      input.source.relativePath,
    );
    const collectionPath = input.collectionPath ?? derivedCollectionPath;
    if (
      !input.title ||
      input.source.bytes.length === 0 ||
      !input.source.scope ||
      !input.source.relativePath ||
      !Number.isInteger(input.wordCount) ||
      input.wordCount < 0 ||
      input.chapters.length === 0 ||
      input.chapters.some(
        (chapter, index) =>
          chapter.index !== index || !chapter.title || !chapter.content,
      ) ||
      normalizedSourcePath !== input.source.relativePath ||
      collectionPath !== derivedCollectionPath
    ) {
      throw new Error('PUBLIC_LIBRARY_CANONICAL_CANDIDATE_INVALID');
    }
    const sourceHash = sha256(input.source.bytes);
    const categoryId = requireCategoryIdFromLabel(input.category);
    const tagIds = requireTagIds(input.tagIds ?? []);
    const editionHash = sha256(
      JSON.stringify(
        input.chapters.map((chapter) => ({
          index: chapter.index,
          title: chapter.title,
          content: chapter.content,
        })),
      ),
    );
    const bookId = `public-${editionHash.slice(0, 24)}`;
    const sourceIdentity = `${input.source.kind}\0${input.source.scope}\0${input.source.relativePath}\0${sourceHash}`;
    const candidate: PreparedCandidate = {
      title: input.title,
      author: input.author,
      description: input.description,
      category: input.category,
      categoryId,
      tagIds,
      ingestMetadataHash: ingestMetadataHash({
        title: input.title,
        author: input.author,
        description: input.description,
        categoryId,
        collectionPath,
        tagIds,
      }),
      collectionPath,
      sourceHash,
      editionHash,
      sourceId: sha256(`source\0${sourceIdentity}`),
      receiptKey: sha256(`receipt\0${sourceIdentity}`),
      sourceKind: input.source.kind,
      sourceScope: input.source.scope,
      relativePath: input.source.relativePath,
      publicationFence: input.publicationFence,
      chapters: input.chapters.map((chapter) => ({
        id: `${bookId}-chapter-${chapter.index}`,
        index: chapter.index,
        title: chapter.title,
        content: chapter.content,
        contentHash: sha256(chapter.content),
      })),
      wordCount: input.wordCount,
    };
    const existing = await this.findByEdition(editionHash);
    if (existing) {
      this.assertMetadata(existing, candidate);
      return {
        outcome: 'unchanged',
        book: await this.attachSourceToExisting(
          requireString(existing.id, 'PUBLIC_LIBRARY_BOOK_ID_MISSING'),
          candidate,
        ),
      };
    }
    if (input.source.kind === 'legacy_json') {
      const legacyIdentityHash = sha256(`${input.title}\0${sourceHash}`);
      const legacy = await this.upgradeLegacyBook(
        `public-${legacyIdentityHash.slice(0, 24)}`,
        candidate,
      );
      if (legacy) return { outcome: 'unchanged', book: legacy };
    }

    const pending = this.inFlightByEdition.get(editionHash);
    if (pending) {
      const pendingResult = await pending;
      return {
        outcome: 'unchanged',
        book: await this.attachSourceToExisting(
          pendingResult.book.id,
          candidate,
        ),
      };
    }
    const operation = this.publishPrepared(candidate, bookId).finally(() => {
      this.inFlightByEdition.delete(editionHash);
    });
    this.inFlightByEdition.set(editionHash, operation);
    return operation;
  }

  private async publishPrepared(
    candidate: PreparedCandidate,
    bookId: string,
  ): Promise<PublicLibraryPublicationResult> {
    const publishedAt = this.now();
    const maintainerResult = await this.client.execute(
      'SELECT maintainer_id, label FROM public_maintainers WHERE id = 1',
    );
    const maintainerId = requireString(
      maintainerResult.rows[0]?.maintainer_id,
      'PUBLIC_LIBRARY_MAINTAINER_ID_MISSING',
    );
    const maintainerLabel = requireString(
      maintainerResult.rows[0]?.label,
      'PUBLIC_LIBRARY_MAINTAINER_LABEL_MISSING',
    );
    const book: PublicLibraryBookDto = {
      id: bookId,
      title: candidate.title,
      author: candidate.author,
      description: candidate.description,
      format: 'txt',
      taxonomyVersion: PUBLIC_LIBRARY_TAXONOMY_VERSION,
      categoryId: candidate.categoryId,
      category: candidate.category,
      tags: tagDtos(candidate.tagIds),
      maintainerId,
      maintainerLabel,
      metadataVersion: 1,
      collectionPath: candidate.collectionPath || undefined,
      chapterCount: candidate.chapters.length,
      wordCount: candidate.wordCount,
      contentHash: candidate.sourceHash,
      publishedAt,
    };
    const bundle: PublicLibraryPackage = {
      schemaVersion: 1,
      taxonomyVersion: PUBLIC_LIBRARY_TAXONOMY_VERSION,
      book: { ...book, collectionPath: undefined },
      chapters: candidate.chapters,
    };
    const serialized = canonicalPackage(bundle);
    const packageHash = sha256(serialized);
    await this.blobs.putObject(packageHash, serialized);
    const readback = await this.blobs.getObject(packageHash);
    if (sha256(readback) !== packageHash) {
      throw new Error('PUBLIC_LIBRARY_BLOB_READBACK_FAILED');
    }

    const publication = { candidate, book, packageHash };
    return retrySqliteBusy(() => this.publishPreparedOnce(publication));
  }

  private async publishPreparedOnce(
    publication: PreparedPublication,
  ): Promise<PublicLibraryPublicationResult> {
    const { candidate, book, packageHash } = publication;
    const publishedAt = book.publishedAt;

    try {
      const results = await this.client.batch(
        [
          {
            sql: `INSERT INTO public_books (
              id, title, author, description, format, category, chapter_count,
              word_count, content_hash, package_hash, published_at,
              edition_hash, source_hash, maintainer_id, collection_path,
              metadata_version, created_revision, category_id,
              ingest_category_id,
              ingest_metadata_hash
            ) VALUES (
              ?, ?, ?, ?, 'txt', ?, ?, ?, ?, ?, ?, ?, ?,
              (SELECT maintainer_id FROM public_maintainers WHERE id = 1),
              ?, 1,
              (SELECT revision + 1 FROM public_catalog_state WHERE id = 1),
              ?, ?, ?
            )`,
            args: [
              book.id,
              book.title,
              book.author ?? null,
              book.description ?? null,
              book.category,
              book.chapterCount,
              book.wordCount,
              book.contentHash,
              packageHash,
              book.publishedAt,
              candidate.editionHash,
              candidate.sourceHash,
              candidate.collectionPath,
              candidate.categoryId,
              candidate.categoryId,
              candidate.ingestMetadataHash,
            ],
          },
          {
            sql: `INSERT INTO public_editions (
              edition_hash, package_hash, content_hash, chapter_count,
              word_count, created_at
            ) VALUES (?, ?, ?, ?, ?, ?)`,
            args: [
              candidate.editionHash,
              packageHash,
              candidate.sourceHash,
              book.chapterCount,
              book.wordCount,
              publishedAt,
            ],
          },
          ...this.sourceFactStatements(book.id, candidate, publishedAt),
          ...candidate.tagIds.map((tagId) => ({
            sql: 'INSERT INTO public_book_tags (book_id, tag_id) VALUES (?, ?)',
            args: [book.id, tagId],
          })),
          {
            sql: `INSERT INTO public_books_search_v3
              (book_id, title, author, maintainer_label) VALUES (?, ?, ?, ?)`,
            args: [
              book.id,
              normalizeSearchValue(book.title),
              normalizeSearchValue(book.author ?? ''),
              normalizeSearchValue(book.maintainerLabel),
            ],
          },
          ...shortSearchTerms(
            book.title,
            book.author,
            book.maintainerLabel,
          ).map((term) => ({
            sql: 'INSERT INTO public_book_search_terms (book_id, term) VALUES (?, ?)',
            args: [book.id, term],
          })),
          {
            sql: 'UPDATE public_catalog_state SET revision = revision + 1 WHERE id = 1',
            args: [],
          },
          {
            sql: `SELECT b.*, m.label AS maintainer_label,
              COALESCE(GROUP_CONCAT(t.tag_id, char(31)), '') AS tag_ids,
              e.package_hash AS edition_package_hash,
              s.source_hash AS saved_source_hash, r.status AS receipt_status
              FROM public_books b
              JOIN public_maintainers m ON m.maintainer_id = b.maintainer_id
              LEFT JOIN public_book_tags t ON t.book_id = b.id
              JOIN public_editions e ON e.edition_hash = b.edition_hash
              JOIN public_sources s ON s.book_id = b.id
              JOIN public_ingest_receipts r ON r.book_id = b.id
              WHERE b.id = ? AND s.source_id = ? AND r.receipt_key = ?
              GROUP BY b.id LIMIT 1`,
            args: [book.id, candidate.sourceId, candidate.receiptKey],
          },
        ],
        'write',
      );
      this.assertSourceReadback(results[4]?.rows[0], book.id, candidate);
      const row = results.at(-1)?.rows[0] as
        | Record<string, unknown>
        | undefined;
      if (
        !row ||
        row.edition_package_hash !== packageHash ||
        row.saved_source_hash !== candidate.sourceHash ||
        row.receipt_status !== 'succeeded'
      ) {
        throw new Error('PUBLIC_LIBRARY_TRANSACTION_READBACK_FAILED');
      }
      return { outcome: 'created', book: rowToBook(row) };
    } catch (error) {
      const existing = await this.findByEdition(candidate.editionHash);
      if (existing) {
        this.assertMetadata(existing, candidate);
        return {
          outcome: 'unchanged',
          book: await this.attachSourceToExisting(
            requireString(existing.id, 'PUBLIC_LIBRARY_BOOK_ID_MISSING'),
            candidate,
          ),
        };
      }
      throw error;
    }
  }

  async list(query: PublicLibraryListQuery) {
    assertCatalogPage(query.page, query.pageSize);
    const transaction = await this.client.transaction('read');
    try {
      const state = await transaction.execute(
        'SELECT revision FROM public_catalog_state WHERE id = 1',
      );
      const snapshotRevision = Number(state.rows[0]?.revision ?? 0);
      if (
        query.snapshotRevision !== undefined &&
        query.snapshotRevision !== snapshotRevision
      ) {
        throw new Error('PUBLIC_LIBRARY_CATALOG_SNAPSHOT_STALE');
      }
      const clauses: string[] = [];
      const args: Array<string | number> = [];
      if (query.q) {
        const match = buildSearchMatch(query.q);
        const normalizedQuery = query.q
          .normalize('NFKC')
          .toLocaleLowerCase('en-US');
        clauses.push(
          [...normalizedQuery].length <= 2
            ? 'b.id IN (SELECT book_id FROM public_book_search_terms WHERE term = ?)'
            : match
              ? 'b.id IN (SELECT book_id FROM public_books_search_v3 WHERE public_books_search_v3 MATCH ?)'
              : '0 = 1',
        );
        if (match) {
          args.push([...normalizedQuery].length <= 2 ? normalizedQuery : match);
        }
      }
      if (query.category) {
        clauses.push('b.category = ?');
        args.push(query.category);
      }
      if (query.categoryId) {
        clauses.push('b.category_id = ?');
        args.push(query.categoryId);
      }
      if (query.maintainerId) {
        clauses.push('b.maintainer_id = ?');
        args.push(query.maintainerId);
      }
      if (query.tagId) {
        clauses.push(
          'b.id IN (SELECT book_id FROM public_book_tags WHERE tag_id = ?)',
        );
        args.push(query.tagId);
      }
      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const count = await transaction.execute({
        sql: `SELECT COUNT(DISTINCT b.id) AS total FROM public_books b ${where}`,
        args,
      });
      const total = Number(count.rows[0]?.total ?? 0);
      const offset = (query.page - 1) * query.pageSize;
      const rows = await transaction.execute({
        sql: `${BOOK_SELECT} ${where} GROUP BY b.id
          ORDER BY b.published_at DESC, b.id ASC LIMIT ? OFFSET ?`,
        args: [...args, query.pageSize, offset],
      });
      await transaction.commit();
      return {
        items: rows.rows.map((row) =>
          rowToBook(row as Record<string, unknown>),
        ),
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
        snapshotRevision,
        taxonomyVersion: PUBLIC_LIBRARY_TAXONOMY_VERSION,
      };
    } catch (error) {
      await transaction.rollback().catch(() => undefined);
      throw error;
    }
  }

  async listFacets(query: PublicLibraryFacetQuery) {
    assertCatalogPage(query.page, query.pageSize);
    const transaction = await this.client.transaction('read');
    try {
      const state = await transaction.execute(
        'SELECT revision FROM public_catalog_state WHERE id = 1',
      );
      const snapshotRevision = Number(state.rows[0]?.revision ?? 0);
      if (
        query.snapshotRevision !== undefined &&
        query.snapshotRevision !== snapshotRevision
      ) {
        throw new Error('PUBLIC_LIBRARY_CATALOG_SNAPSHOT_STALE');
      }
      const normalizedFacetQuery = query.q
        .normalize('NFKC')
        .trim()
        .toLocaleLowerCase('en-US');
      const escaped = normalizedFacetQuery.replace(
        /[\\%_]/g,
        (value) => `\\${value}`,
      );
      const args: Array<string | number> = normalizedFacetQuery
        ? [`${escaped}%`]
        : [];
      const labelFilter = normalizedFacetQuery
        ? "AND LOWER(label) LIKE ? ESCAPE '\\'"
        : '';
      let from = '';
      let idColumn = '';
      let order = '';
      if (query.view === 'categories') {
        from = `FROM (
          SELECT c.category_id AS id, c.label AS label, c.sort_order AS rank,
            COUNT(b.id) AS book_count
          FROM public_categories c
          JOIN public_books b ON b.category_id = c.category_id
          GROUP BY c.category_id, c.label, c.sort_order
        ) facets WHERE book_count > 0 ${labelFilter}`;
        idColumn = 'id';
        order = 'rank ASC, id ASC';
      } else if (query.view === 'tags') {
        from = `FROM (
          SELECT t.tag_id AS id, t.label AS label, t.sort_order AS rank,
            COUNT(bt.book_id) AS book_count
          FROM public_tags t
          JOIN public_book_tags bt ON bt.tag_id = t.tag_id
          GROUP BY t.tag_id, t.label, t.sort_order
        ) facets WHERE book_count > 0 ${labelFilter}`;
        idColumn = 'id';
        order = 'rank ASC, id ASC';
      } else {
        from = `FROM (
          SELECT m.maintainer_id AS id, m.label AS label, 0 AS rank,
            COUNT(b.id) AS book_count
          FROM public_maintainers m
          JOIN public_books b ON b.maintainer_id = m.maintainer_id
          GROUP BY m.maintainer_id, m.label
        ) facets WHERE book_count > 0 ${labelFilter}`;
        idColumn = 'id';
        order = 'book_count DESC, id ASC';
      }
      const count = await transaction.execute({
        sql: `SELECT COUNT(*) AS total ${from}`,
        args,
      });
      const total = Number(count.rows[0]?.total ?? 0);
      const rows = await transaction.execute({
        sql: `SELECT ${idColumn} AS id, label, book_count ${from}
          ORDER BY ${order} LIMIT ? OFFSET ?`,
        args: [...args, query.pageSize, (query.page - 1) * query.pageSize],
      });
      await transaction.commit();
      return {
        view: query.view,
        items: rows.rows.map((row) => ({
          id: requireString(row.id, 'PUBLIC_LIBRARY_FACET_ID_MISSING'),
          label: requireString(row.label, 'PUBLIC_LIBRARY_FACET_LABEL_MISSING'),
          bookCount: Number(row.book_count),
        })),
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
        snapshotRevision,
        taxonomyVersion: PUBLIC_LIBRARY_TAXONOMY_VERSION,
      };
    } catch (error) {
      await transaction.rollback().catch(() => undefined);
      throw error;
    }
  }

  async updateCatalog(id: string, patch: PublicLibraryCatalogPatch) {
    const category = requireCategory(patch.categoryId);
    const tagIds = requireTagIds(patch.tagIds);
    const statements: InStatement[] = [
      {
        sql: `DELETE FROM public_book_tags WHERE book_id = ? AND EXISTS (
          SELECT 1 FROM public_books WHERE id = ? AND metadata_version = ?
        )`,
        args: [id, id, patch.metadataVersion],
      },
      ...tagIds.map((tagId) => ({
        sql: `INSERT INTO public_book_tags (book_id, tag_id)
          SELECT ?, ? WHERE EXISTS (
            SELECT 1 FROM public_books WHERE id = ? AND metadata_version = ?
          )`,
        args: [id, tagId, id, patch.metadataVersion],
      })),
      {
        sql: `UPDATE public_catalog_state SET revision = revision + 1
          WHERE id = 1 AND EXISTS (
            SELECT 1 FROM public_books WHERE id = ? AND metadata_version = ?
          )`,
        args: [id, patch.metadataVersion],
      },
      {
        sql: `UPDATE public_books SET category_id = ?, category = ?,
          collection_path = ?, metadata_version = metadata_version + 1
          WHERE id = ? AND metadata_version = ?`,
        args: [
          category.id,
          category.label,
          patch.collectionPath,
          id,
          patch.metadataVersion,
        ],
      },
      {
        sql: `${BOOK_SELECT} WHERE b.id = ? GROUP BY b.id LIMIT 1`,
        args: [id],
      },
    ];
    const results = await retrySqliteBusy(() =>
      this.client.batch(statements, 'write'),
    );
    const updateResult = results.at(-2);
    const row = results.at(-1)?.rows[0] as Record<string, unknown> | undefined;
    if (Number(updateResult?.rowsAffected ?? 0) !== 1) {
      if (!row) throw new PublicLibraryBookNotFoundError();
      throw new PublicLibraryCatalogMetadataStaleError(
        Number(row.metadata_version),
      );
    }
    if (!row) throw new Error('PUBLIC_LIBRARY_CATALOG_READBACK_FAILED');
    return rowToBook(row);
  }

  async getPackage(id: string): Promise<PublicLibraryPackage> {
    const result = await this.client.execute({
      sql: 'SELECT package_hash FROM public_books WHERE id = ? LIMIT 1',
      args: [id],
    });
    const packageHash = result.rows[0]?.package_hash;
    if (typeof packageHash !== 'string') {
      throw new PublicLibraryBookNotFoundError();
    }
    const bytes = await this.blobs.getObject(packageHash);
    if (sha256(bytes) !== packageHash) {
      throw new Error('PUBLIC_LIBRARY_PACKAGE_HASH_MISMATCH');
    }
    let bundle: PublicLibraryPackage;
    try {
      bundle = JSON.parse(bytes.toString('utf8')) as PublicLibraryPackage;
    } catch {
      throw new Error('PUBLIC_LIBRARY_PACKAGE_INVALID');
    }
    if (
      !bundle ||
      bundle.schemaVersion !== 1 ||
      (bundle.taxonomyVersion !== undefined &&
        bundle.taxonomyVersion !== PUBLIC_LIBRARY_TAXONOMY_VERSION) ||
      bundle.book?.id !== id ||
      bundle.book?.chapterCount !== bundle.chapters?.length ||
      !Array.isArray(bundle.chapters) ||
      bundle.chapters.some(
        (chapter, index) =>
          !chapter ||
          chapter.index !== index ||
          sha256(chapter.content) !== chapter.contentHash,
      )
    ) {
      throw new Error('PUBLIC_LIBRARY_PACKAGE_INVALID');
    }
    const current = await this.client.execute({
      sql: `${BOOK_SELECT} WHERE b.id = ? GROUP BY b.id LIMIT 1`,
      args: [id],
    });
    const currentRow = current.rows[0] as Record<string, unknown> | undefined;
    if (!currentRow) throw new PublicLibraryBookNotFoundError();
    return {
      ...bundle,
      taxonomyVersion: PUBLIC_LIBRARY_TAXONOMY_VERSION,
      book: rowToBook(currentRow),
    };
  }
}
