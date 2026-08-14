import { createClient, type Client } from '@libsql/client';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseTxtBook } from '@reader/parser-core/txt-parser';
import { LocalFileBlobStorage } from '@reader/storage-core/node';
import {
  preparePublicLibraryDatabase,
  PublicLibraryDuplicateMetadataError,
  PublicLibraryRepository,
} from './public-library.repository';

describe('PublicLibraryRepository', () => {
  let client: Client;
  let root: string;
  let repository: PublicLibraryRepository;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'public-library-'));
    client = createClient({ url: `file:${join(root, 'catalog.sqlite')}` });
    await preparePublicLibraryDatabase(client);
    repository = new PublicLibraryRepository(
      client,
      new LocalFileBlobStorage(root),
      () => '2026-08-15T00:00:00.000Z',
    );
  });

  afterEach(async () => {
    client.close();
    await rm(root, { recursive: true, force: true });
  });

  it('publishes one immutable TXT package and reads it anonymously', async () => {
    const book = await repository.publishTxt({
      title: '公共纵切样本',
      author: '测试维护者',
      category: '经典',
      content: '第一章 起点\n完整正文一\n\n第二章 继续\n完整正文二',
      rightsConfirmed: true,
    });

    await expect(
      repository.list({ q: '纵切', category: '经典', page: 1, pageSize: 1 }),
    ).resolves.toMatchObject({ items: [book], page: 1, pageSize: 1, total: 1 });
    const bundle = await repository.getPackage(book.id);
    expect(bundle.book).toEqual(book);
    expect(bundle.chapters).toHaveLength(2);
    expect(bundle.chapters.map((chapter) => chapter.index)).toEqual([0, 1]);
    expect(
      bundle.chapters.every((chapter) => chapter.contentHash.length === 64),
    ).toBe(true);
  });

  it('keeps pagination bounded and idempotently reuses the same package', async () => {
    const input = {
      title: '幂等样本',
      category: '技术' as const,
      content: '正文内容',
      rightsConfirmed: true as const,
    };
    const first = await repository.publishTxt(input);
    const second = await repository.publishTxt(input);
    expect(second).toEqual(first);
    await expect(
      repository.list({ q: '', page: 1, pageSize: 48 }),
    ).resolves.toMatchObject({
      total: 1,
      totalPages: 1,
      snapshotRevision: 1,
    });
  });

  it('deduplicates concurrent editions and rejects conflicting metadata', async () => {
    const input = {
      title: '并发版本',
      author: '同一维护者',
      category: '经典' as const,
      content: '第一章\n相同正文',
      rightsConfirmed: true as const,
    };
    const competingClient = createClient({
      url: `file:${join(root, 'catalog.sqlite')}`,
    });
    const objects = new Map<string, Buffer>();
    const instantStorage = {
      putObject(key: string, value: string | Buffer) {
        if (!objects.has(key)) objects.set(key, Buffer.from(value));
        return Promise.resolve();
      },
      getObject(key: string) {
        const value = objects.get(key);
        if (!value) throw new Error('OBJECT_NOT_FOUND');
        return Promise.resolve(Buffer.from(value));
      },
      deleteObject(key: string) {
        objects.delete(key);
        return Promise.resolve();
      },
    } as unknown as LocalFileBlobStorage;
    repository = new PublicLibraryRepository(
      client,
      instantStorage,
      () => '2026-08-15T00:00:00.000Z',
    );
    const competingRepository = new PublicLibraryRepository(
      competingClient,
      instantStorage,
      () => '2026-08-15T00:00:00.001Z',
    );
    let existingBookId = '';
    try {
      const [left, right] = await Promise.all([
        repository.publishTxt(input),
        competingRepository.publishTxt(input),
      ]);
      expect(left.id).toBe(right.id);
      existingBookId = left.id;
    } finally {
      competingClient.close();
    }
    const counts = await Promise.all(
      [
        'public_books',
        'public_editions',
        'public_sources',
        'public_ingest_receipts',
      ].map(async (table) =>
        Number(
          (await client.execute(`SELECT COUNT(*) AS total FROM ${table}`))
            .rows[0]?.total ?? 0,
        ),
      ),
    );
    expect(counts).toEqual([1, 1, 1, 1]);
    const conflict = await repository
      .publishTxt({ ...input, category: '思想' })
      .catch((error: unknown) => error);
    expect(conflict).toBeInstanceOf(PublicLibraryDuplicateMetadataError);
    expect(conflict).toMatchObject({
      code: 'duplicate_metadata_conflict',
      existingBookId,
    });
    await expect(
      repository.list({ q: '', page: 1, pageSize: 24 }),
    ).resolves.toMatchObject({ total: 1, snapshotRevision: 1 });
  });

  it('records each provenance while reusing one canonical edition', async () => {
    const canonical = {
      title: '多来源同版',
      category: '经典' as const,
      chapters: [{ index: 0, title: '正文', content: '同一规范正文' }],
      wordCount: 6,
    };
    const first = await repository.publishCandidate({
      ...canonical,
      source: {
        kind: 'browser_file',
        scope: 'browser-job-a',
        relativePath: '甲/同版.txt',
        bytes: Buffer.from('浏览器来源字节'),
      },
    });
    const second = await repository.publishCandidate({
      ...canonical,
      source: {
        kind: 'maintenance_scan',
        scope: 'root-a',
        relativePath: '乙/同版.txt',
        bytes: Buffer.from('服务端来源字节'),
      },
    });
    expect(second.id).toBe(first.id);
    await expect(
      client.execute('SELECT COUNT(*) AS total FROM public_books'),
    ).resolves.toMatchObject({ rows: [{ total: 1 }] });
    await expect(
      client.execute('SELECT COUNT(*) AS total FROM public_sources'),
    ).resolves.toMatchObject({ rows: [{ total: 2 }] });
    await expect(
      client.execute('SELECT COUNT(*) AS total FROM public_ingest_receipts'),
    ).resolves.toMatchObject({ rows: [{ total: 2 }] });
    await expect(
      repository.list({ q: '', page: 1, pageSize: 24 }),
    ).resolves.toMatchObject({ total: 1, snapshotRevision: 1 });
  });

  it('prepares one additive schema safely through competing clients', async () => {
    const databasePath = join(root, 'prepare-race.sqlite');
    const left = createClient({ url: `file:${databasePath}` });
    const right = createClient({ url: `file:${databasePath}` });
    try {
      await Promise.all([
        preparePublicLibraryDatabase(left),
        preparePublicLibraryDatabase(right),
      ]);
      await expect(
        left.execute('SELECT COUNT(*) AS total FROM public_catalog_state'),
      ).resolves.toMatchObject({ rows: [{ total: 1 }] });
      const columns = await right.execute('PRAGMA table_info(public_books)');
      const columnNames = columns.rows.map((row) => row.name);
      expect(columnNames).toContain('edition_hash');
      expect(columnNames).toContain('created_revision');
    } finally {
      left.close();
      right.close();
    }
  });

  it('rolls back all catalog facts after blob success and resumes from the same receipt', async () => {
    await client.execute(`
      CREATE TRIGGER fail_public_source_insert
      BEFORE INSERT ON public_sources
      BEGIN
        SELECT RAISE(ABORT, 'INJECTED_PUBLIC_DB_FAILURE');
      END
    `);
    const input = {
      title: '可重放版本',
      category: '技术' as const,
      content: '第一章\n不可见直到事务完成',
      rightsConfirmed: true as const,
    };
    await expect(repository.publishTxt(input)).rejects.toThrow(
      'INJECTED_PUBLIC_DB_FAILURE',
    );
    for (const table of [
      'public_books',
      'public_editions',
      'public_sources',
      'public_ingest_receipts',
    ]) {
      await expect(
        client.execute(`SELECT COUNT(*) AS total FROM ${table}`),
      ).resolves.toMatchObject({ rows: [{ total: 0 }] });
    }
    await expect(
      client.execute('SELECT revision FROM public_catalog_state WHERE id = 1'),
    ).resolves.toMatchObject({ rows: [{ revision: 0 }] });

    await client.execute('DROP TRIGGER fail_public_source_insert');
    await expect(repository.publishTxt(input)).resolves.toMatchObject({
      title: input.title,
    });
    await expect(
      repository.list({ q: '', page: 1, pageSize: 24 }),
    ).resolves.toMatchObject({ total: 1, snapshotRevision: 1 });
  });

  it('invalidates an old catalog revision instead of mixing pages after a write', async () => {
    await repository.publishTxt({
      title: '快照第一页',
      category: '经典',
      content: '正文一',
      rightsConfirmed: true,
    });
    const first = await repository.list({ q: '', page: 1, pageSize: 1 });
    expect(first.snapshotRevision).toBe(1);
    await repository.publishTxt({
      title: '同一时刻的新书',
      category: '经典',
      content: '正文二',
      rightsConfirmed: true,
    });
    await expect(
      repository.list({
        q: '',
        page: 2,
        pageSize: 1,
        snapshotRevision: first.snapshotRevision,
      }),
    ).rejects.toThrow('PUBLIC_LIBRARY_CATALOG_SNAPSHOT_STALE');
    await expect(
      repository.list({ q: '', page: 1, pageSize: 1 }),
    ).resolves.toMatchObject({ total: 2, snapshotRevision: 2 });
  });

  it('does not expose a directory row when the immutable blob write fails', async () => {
    const failingRepository = new PublicLibraryRepository(
      client,
      {
        putObject: jest.fn(() =>
          Promise.reject(new Error('INJECTED_PUBLIC_BLOB_FAILURE')),
        ),
        getObject: jest.fn(),
      } as never,
      () => '2026-08-15T00:00:00.000Z',
    );

    await expect(
      failingRepository.publishTxt({
        title: '不得半可见',
        category: '其他',
        content: '完整正文',
        rightsConfirmed: true,
      }),
    ).rejects.toThrow('INJECTED_PUBLIC_BLOB_FAILURE');
    await expect(
      repository.list({ q: '不得半可见', page: 1, pageSize: 24 }),
    ).resolves.toMatchObject({ total: 0, items: [] });
  });

  it('upgrades the gate 03 schema additively and remains replay safe', async () => {
    const legacyClient = createClient({
      url: `file:${join(root, 'legacy-catalog.sqlite')}`,
    });
    try {
      await legacyClient.execute(`
        CREATE TABLE public_books (
          id TEXT PRIMARY KEY, title TEXT NOT NULL, author TEXT,
          description TEXT, format TEXT NOT NULL, category TEXT NOT NULL,
          chapter_count INTEGER NOT NULL, word_count INTEGER NOT NULL,
          content_hash TEXT NOT NULL, package_hash TEXT NOT NULL UNIQUE,
          published_at TEXT NOT NULL
        )
      `);
      const input = {
        title: '旧纵切书',
        category: '经典' as const,
        content: '第一章\n旧纵切正文',
        rightsConfirmed: true as const,
      };
      const hash = (value: string | Buffer) =>
        createHash('sha256').update(value).digest('hex');
      const source = Buffer.from(input.content, 'utf8');
      const sourceHash = hash(source);
      const identityHash = hash(`${input.title}\0${sourceHash}`);
      const legacyId = `public-${identityHash.slice(0, 24)}`;
      const parsed = parseTxtBook(
        `${input.title}.txt`,
        source.buffer.slice(
          source.byteOffset,
          source.byteOffset + source.byteLength,
        ),
      );
      const publishedAt = '2026-08-14T00:00:00.000Z';
      const legacyBook = {
        id: legacyId,
        title: input.title,
        format: 'txt' as const,
        category: input.category,
        chapterCount: parsed.chapters.length,
        wordCount: [...input.content].length,
        contentHash: sourceHash,
        publishedAt,
      };
      const legacyPackage = JSON.stringify({
        schemaVersion: 1,
        book: legacyBook,
        chapters: parsed.chapters.map((chapter) => ({
          id: `${legacyId}-chapter-${chapter.index}`,
          index: chapter.index,
          title: chapter.title,
          content: chapter.content,
          contentHash: hash(chapter.content),
        })),
      });
      const packageHash = hash(legacyPackage);
      const legacyStorage = new LocalFileBlobStorage(
        join(root, 'legacy-objects'),
      );
      await legacyStorage.putObject(packageHash, legacyPackage);
      await legacyClient.execute({
        sql: `INSERT INTO public_books (
          id, title, format, category, chapter_count, word_count,
          content_hash, package_hash, published_at
        ) VALUES (?, ?, 'txt', '经典', ?, ?, ?, ?, ?)`,
        args: [
          legacyId,
          input.title,
          legacyBook.chapterCount,
          legacyBook.wordCount,
          sourceHash,
          packageHash,
          publishedAt,
        ],
      });

      await preparePublicLibraryDatabase(legacyClient);
      await preparePublicLibraryDatabase(legacyClient);

      await expect(
        legacyClient.execute(
          'SELECT title, edition_hash, source_hash, metadata_version FROM public_books',
        ),
      ).resolves.toMatchObject({
        rows: [
          {
            title: '旧纵切书',
            edition_hash: null,
            source_hash: sourceHash,
            metadata_version: 1,
          },
        ],
      });
      await expect(
        legacyClient.execute(
          'SELECT revision FROM public_catalog_state WHERE id = 1',
        ),
      ).resolves.toMatchObject({ rows: [{ revision: 1 }] });
      await expect(
        legacyClient.execute('SELECT COUNT(*) AS total FROM public_editions'),
      ).resolves.toMatchObject({ rows: [{ total: 0 }] });

      const upgradedRepository = new PublicLibraryRepository(
        legacyClient,
        legacyStorage,
        () => '2026-08-15T00:00:00.000Z',
      );
      await expect(upgradedRepository.publishTxt(input)).resolves.toMatchObject(
        { id: legacyId },
      );
      await expect(
        legacyClient.execute('SELECT COUNT(*) AS total FROM public_books'),
      ).resolves.toMatchObject({ rows: [{ total: 1 }] });
      await expect(
        legacyClient.execute('SELECT COUNT(*) AS total FROM public_editions'),
      ).resolves.toMatchObject({ rows: [{ total: 1 }] });
      await expect(
        legacyClient.execute('SELECT COUNT(*) AS total FROM public_sources'),
      ).resolves.toMatchObject({ rows: [{ total: 1 }] });
      await expect(
        legacyClient.execute(
          'SELECT COUNT(*) AS total FROM public_ingest_receipts',
        ),
      ).resolves.toMatchObject({ rows: [{ total: 1 }] });
    } finally {
      legacyClient.close();
    }
  });
});
