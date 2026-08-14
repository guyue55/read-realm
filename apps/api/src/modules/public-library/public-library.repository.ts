import type { Client } from '@libsql/client';
import { LocalFileBlobStorage } from '@reader/storage-core/node';
import { parseTxtBook } from '@reader/parser-core/txt-parser';
import { createHash } from 'node:crypto';
import type {
  PublicLibraryBookDto,
  PublicLibraryListQuery,
  PublicLibraryPackage,
  PublicLibraryUpload,
} from './public-library.contract';

function sha256(value: string | Buffer) {
  return createHash('sha256').update(value).digest('hex');
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
    chapterCount: Number(row.chapter_count),
    wordCount: Number(row.word_count),
    contentHash: String(row.content_hash),
    publishedAt: String(row.published_at),
  };
}

export async function preparePublicLibraryDatabase(client: Client) {
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
  await client.execute(
    'CREATE INDEX IF NOT EXISTS public_books_category_published_idx ON public_books(category, published_at DESC, id ASC)',
  );
}

export class PublicLibraryRepository {
  constructor(
    private readonly client: Client,
    private readonly blobs: LocalFileBlobStorage,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

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
    const contentHash = sha256(source);
    const identityHash = sha256(`${input.title}\0${contentHash}`);
    const id = `public-${identityHash.slice(0, 24)}`;
    const existing = await this.client.execute({
      sql: 'SELECT * FROM public_books WHERE id = ? LIMIT 1',
      args: [id],
    });
    const existingRow = existing.rows[0] as Record<string, unknown> | undefined;
    if (existingRow) {
      if (existingRow.content_hash !== contentHash) {
        throw new Error('PUBLIC_LIBRARY_ID_CONFLICT');
      }
      return rowToBook(existingRow);
    }
    const publishedAt = this.now();
    const book: PublicLibraryBookDto = {
      id,
      title: input.title,
      author: input.author,
      description: input.description,
      format: 'txt',
      category: input.category,
      chapterCount: parsed.chapters.length,
      wordCount: [...input.content].length,
      contentHash,
      publishedAt,
    };
    const bundle: PublicLibraryPackage = {
      schemaVersion: 1,
      book,
      chapters: parsed.chapters.map((chapter) => ({
        id: `${id}-chapter-${chapter.index}`,
        index: chapter.index,
        title: chapter.title,
        content: chapter.content,
        contentHash: sha256(chapter.content),
      })),
    };
    const serialized = canonicalPackage(bundle);
    const packageHash = sha256(serialized);
    await this.blobs.putObject(packageHash, serialized);
    const readback = await this.blobs.getObject(packageHash);
    if (sha256(readback) !== packageHash)
      throw new Error('PUBLIC_LIBRARY_BLOB_READBACK_FAILED');

    await this.client.execute({
      sql: `INSERT INTO public_books (
        id, title, author, description, format, category, chapter_count,
        word_count, content_hash, package_hash, published_at
      ) VALUES (?, ?, ?, ?, 'txt', ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO NOTHING`,
      args: [
        id,
        book.title,
        book.author ?? null,
        book.description ?? null,
        book.category,
        book.chapterCount,
        book.wordCount,
        book.contentHash,
        packageHash,
        book.publishedAt,
      ],
    });
    const saved = await this.client.execute({
      sql: 'SELECT * FROM public_books WHERE id = ? LIMIT 1',
      args: [id],
    });
    const row = saved.rows[0] as Record<string, unknown> | undefined;
    if (!row || row.package_hash !== packageHash)
      throw new Error('PUBLIC_LIBRARY_ID_CONFLICT');
    return rowToBook(row);
  }

  async list(query: PublicLibraryListQuery) {
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
    const count = await this.client.execute({
      sql: `SELECT COUNT(*) AS total FROM public_books ${where}`,
      args,
    });
    const total = Number(count.rows[0]?.total ?? 0);
    const offset = (query.page - 1) * query.pageSize;
    const rows = await this.client.execute({
      sql: `SELECT * FROM public_books ${where}
        ORDER BY published_at DESC, id ASC LIMIT ? OFFSET ?`,
      args: [...args, query.pageSize, offset],
    });
    return {
      items: rows.rows.map((row) => rowToBook(row as Record<string, unknown>)),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async getPackage(id: string): Promise<PublicLibraryPackage> {
    const result = await this.client.execute({
      sql: 'SELECT package_hash FROM public_books WHERE id = ? LIMIT 1',
      args: [id],
    });
    const packageHash = result.rows[0]?.package_hash;
    if (typeof packageHash !== 'string')
      throw new Error('PUBLIC_LIBRARY_BOOK_NOT_FOUND');
    const bytes = await this.blobs.getObject(packageHash);
    if (sha256(bytes) !== packageHash)
      throw new Error('PUBLIC_LIBRARY_PACKAGE_HASH_MISMATCH');
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
    return bundle;
  }
}
