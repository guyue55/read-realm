import type { Client, InStatement } from '@libsql/client';
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
  normalizePublicLibraryRelativePath,
  publicLibraryCollectionPath,
} from './public-library.contract';

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

function rowToBook(row: Record<string, unknown>): PublicLibraryBookDto {
  return {
    id: String(row.id),
    title: String(row.title),
    author: optionalText(row.author),
    description: optionalText(row.description),
    format: 'txt',
    category: String(row.category) as PublicLibraryBookDto['category'],
    collectionPath: optionalText(row.collection_path),
    chapterCount: Number(row.chapter_count),
    wordCount: Number(row.word_count),
    contentHash: String(row.content_hash),
    publishedAt: String(row.published_at),
  };
}

async function ensureColumn(
  client: Client,
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

async function preparePublicLibraryDatabaseOnce(client: Client) {
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
    'SELECT maintainer_id FROM public_maintainers WHERE id = 1',
  );
  const maintainerId = requireString(
    maintainer.rows[0]?.maintainer_id,
    'PUBLIC_LIBRARY_MAINTAINER_ID_MISSING',
  );
  await client.execute({
    sql: `UPDATE public_books
      SET source_hash = COALESCE(source_hash, content_hash),
          maintainer_id = COALESCE(maintainer_id, ?)`,
    args: [maintainerId],
  });
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
      tag_id TEXT NOT NULL,
      PRIMARY KEY(book_id, tag_id)
    )
  `);
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
  await retrySqliteBusy(() => preparePublicLibraryDatabaseOnce(client));
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

function sameMetadata(
  book: PublicLibraryBookDto,
  candidate: PreparedCandidate,
) {
  return (
    book.title === candidate.title &&
    book.author === candidate.author &&
    book.description === candidate.description &&
    book.category === candidate.category &&
    (book.collectionPath ?? '') === candidate.collectionPath
  );
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
  ): Promise<PublicLibraryBookDto | undefined> {
    const result = await this.client.execute({
      sql: 'SELECT * FROM public_books WHERE edition_hash = ? LIMIT 1',
      args: [editionHash],
    });
    const row = result.rows[0] as Record<string, unknown> | undefined;
    return row ? rowToBook(row) : undefined;
  }

  private assertMetadata(
    book: PublicLibraryBookDto,
    candidate: PreparedCandidate,
  ) {
    if (!sameMetadata(book, candidate)) {
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
    book: PublicLibraryBookDto,
    candidate: PreparedCandidate,
  ) {
    return retrySqliteBusy(async () => {
      const results = await this.client.batch(
        [
          {
            sql: 'SELECT * FROM public_books WHERE id = ? AND edition_hash = ? LIMIT 1',
            args: [book.id, candidate.editionHash],
          },
          ...this.sourceFactStatements(book.id, candidate, this.now()),
        ],
        'write',
      );
      const currentRow = results[0]?.rows[0] as
        | Record<string, unknown>
        | undefined;
      if (!currentRow) throw new Error('PUBLIC_LIBRARY_EDITION_NOT_FOUND');
      const currentBook = this.assertMetadata(rowToBook(currentRow), candidate);
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
      sql: 'SELECT * FROM public_books WHERE id = ? LIMIT 1',
      args: [legacyId],
    });
    const legacyRow = legacyResult.rows[0] as
      | Record<string, unknown>
      | undefined;
    if (!legacyRow) return undefined;
    const legacyBook = this.assertMetadata(rowToBook(legacyRow), candidate);
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
            sql: `SELECT b.* FROM public_books b
              JOIN public_editions e ON e.edition_hash = b.edition_hash
              JOIN public_sources s ON s.book_id = b.id
              JOIN public_ingest_receipts r ON r.book_id = b.id
              WHERE b.id = ? AND e.package_hash = ? AND r.status = 'succeeded'
              LIMIT 1`,
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
        return this.attachSourceToExisting(
          this.assertMetadata(existing, candidate),
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
      return {
        outcome: 'unchanged',
        book: await this.attachSourceToExisting(
          this.assertMetadata(existing, candidate),
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
          this.assertMetadata(pendingResult.book, candidate),
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
    const book: PublicLibraryBookDto = {
      id: bookId,
      title: candidate.title,
      author: candidate.author,
      description: candidate.description,
      format: 'txt',
      category: candidate.category,
      collectionPath: candidate.collectionPath || undefined,
      chapterCount: candidate.chapters.length,
      wordCount: candidate.wordCount,
      contentHash: candidate.sourceHash,
      publishedAt,
    };
    const bundle: PublicLibraryPackage = {
      schemaVersion: 1,
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
              metadata_version, created_revision
            ) VALUES (
              ?, ?, ?, ?, 'txt', ?, ?, ?, ?, ?, ?, ?, ?,
              (SELECT maintainer_id FROM public_maintainers WHERE id = 1),
              ?, 1,
              (SELECT revision + 1 FROM public_catalog_state WHERE id = 1)
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
          {
            sql: 'UPDATE public_catalog_state SET revision = revision + 1 WHERE id = 1',
            args: [],
          },
          {
            sql: `SELECT b.*, e.package_hash AS edition_package_hash,
              s.source_hash AS saved_source_hash, r.status AS receipt_status
              FROM public_books b
              JOIN public_editions e ON e.edition_hash = b.edition_hash
              JOIN public_sources s ON s.book_id = b.id
              JOIN public_ingest_receipts r ON r.book_id = b.id
              WHERE b.id = ? AND s.source_id = ? AND r.receipt_key = ? LIMIT 1`,
            args: [book.id, candidate.sourceId, candidate.receiptKey],
          },
        ],
        'write',
      );
      this.assertSourceReadback(results.at(-3)?.rows[0], book.id, candidate);
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
        return {
          outcome: 'unchanged',
          book: await this.attachSourceToExisting(
            this.assertMetadata(existing, candidate),
            candidate,
          ),
        };
      }
      throw error;
    }
  }

  async list(query: PublicLibraryListQuery) {
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
        clauses.push("(title LIKE ? ESCAPE '\\' OR author LIKE ? ESCAPE '\\')");
        const escaped = query.q.replace(/[\\%_]/g, (value) => `\\${value}`);
        args.push(`%${escaped}%`, `%${escaped}%`);
      }
      if (query.category) {
        clauses.push('category = ?');
        args.push(query.category);
      }
      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const count = await transaction.execute({
        sql: `SELECT COUNT(*) AS total FROM public_books ${where}`,
        args,
      });
      const total = Number(count.rows[0]?.total ?? 0);
      const offset = (query.page - 1) * query.pageSize;
      const rows = await transaction.execute({
        sql: `SELECT * FROM public_books ${where}
          ORDER BY published_at DESC, id ASC LIMIT ? OFFSET ?`,
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
      };
    } catch (error) {
      await transaction.rollback().catch(() => undefined);
      throw error;
    }
  }

  async getPackage(id: string): Promise<PublicLibraryPackage> {
    const result = await this.client.execute({
      sql: `SELECT package_hash, collection_path
            FROM public_books WHERE id = ? LIMIT 1`,
      args: [id],
    });
    const packageHash = result.rows[0]?.package_hash;
    if (typeof packageHash !== 'string') {
      throw new Error('PUBLIC_LIBRARY_BOOK_NOT_FOUND');
    }
    const bytes = await this.blobs.getObject(packageHash);
    if (sha256(bytes) !== packageHash) {
      throw new Error('PUBLIC_LIBRARY_PACKAGE_HASH_MISMATCH');
    }
    const bundle = JSON.parse(bytes.toString('utf8')) as PublicLibraryPackage;
    if (
      bundle.schemaVersion !== 1 ||
      bundle.book.id !== id ||
      bundle.book.chapterCount !== bundle.chapters.length ||
      bundle.chapters.some(
        (chapter, index) =>
          chapter.index !== index ||
          sha256(chapter.content) !== chapter.contentHash,
      )
    ) {
      throw new Error('PUBLIC_LIBRARY_PACKAGE_INVALID');
    }
    return {
      ...bundle,
      book: {
        ...bundle.book,
        collectionPath: optionalText(result.rows[0]?.collection_path),
      },
    };
  }
}
