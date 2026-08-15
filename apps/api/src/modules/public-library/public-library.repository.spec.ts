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
      repository.list({ q: '', page: 1, pageSize: 24 }),
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
        kind: 'browser_file',
        scope: 'root-a',
        relativePath: '甲/经部/同版.txt',
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

  it('rejects a competing collection without attaching the losing provenance', async () => {
    const databasePath = join(root, 'collection-race.sqlite');
    const leftClient = createClient({ url: `file:${databasePath}` });
    const rightClient = createClient({ url: `file:${databasePath}` });
    await preparePublicLibraryDatabase(leftClient);
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
    const leftRepository = new PublicLibraryRepository(
      leftClient,
      instantStorage,
      () => '2026-08-15T00:00:00.000Z',
    );
    const rightRepository = new PublicLibraryRepository(
      rightClient,
      instantStorage,
      () => '2026-08-15T00:00:00.001Z',
    );
    const canonical = {
      title: '目录竞态',
      category: '经典' as const,
      chapters: [{ index: 0, title: '正文', content: '同一规范正文' }],
      wordCount: 6,
    };
    try {
      const results = await Promise.allSettled([
        leftRepository.publishCandidate({
          ...canonical,
          source: {
            kind: 'browser_file',
            scope: 'browser-job-a',
            relativePath: '甲/同版.txt',
            bytes: Buffer.from('来源甲'),
          },
        }),
        rightRepository.publishCandidate({
          ...canonical,
          source: {
            kind: 'maintenance_scan',
            scope: 'root-b',
            relativePath: '乙/同版.txt',
            bytes: Buffer.from('来源乙'),
          },
        }),
      ]);
      const fulfilled = results.filter(
        (result) => result.status === 'fulfilled',
      );
      const rejected = results.filter((result) => result.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0]).toMatchObject({
        status: 'rejected',
        reason: { code: 'duplicate_metadata_conflict' },
      });
      const counts = await Promise.all(
        ['public_books', 'public_sources', 'public_ingest_receipts'].map(
          async (table) =>
            Number(
              (
                await leftClient.execute(
                  `SELECT COUNT(*) AS total FROM ${table}`,
                )
              ).rows[0]?.total ?? 0,
            ),
        ),
      );
      expect(counts).toEqual([1, 1, 1]);
      await expect(
        leftClient.execute(
          'SELECT revision FROM public_catalog_state WHERE id = 1',
        ),
      ).resolves.toMatchObject({ rows: [{ revision: 1 }] });
    } finally {
      leftClient.close();
      rightClient.close();
    }
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

  it('updates catalog overlays without changing the package or replay baseline', async () => {
    const input = {
      title: '目录覆盖样本',
      category: '经典' as const,
      tagIds: ['jing' as const],
      content: '第一章\n不会随目录修改的正文',
      rightsConfirmed: true as const,
    };
    const created = await repository.publishTxt(input);
    const before = await client.execute({
      sql: 'SELECT package_hash, ingest_metadata_hash FROM public_books WHERE id = ?',
      args: [created.id],
    });
    const updated = await repository.updateCatalog(created.id, {
      metadataVersion: 1,
      categoryId: 'technology',
      tagIds: ['programming', 'product'],
      collectionPath: '工程藏书',
    });
    expect(updated).toMatchObject({
      categoryId: 'technology',
      category: '技术',
      collectionPath: '工程藏书',
      metadataVersion: 2,
      tags: [
        { id: 'programming', label: '编程' },
        { id: 'product', label: '产品' },
      ],
    });
    await expect(repository.getPackage(created.id)).resolves.toMatchObject({
      book: updated,
    });
    await expect(repository.publishTxt(input)).resolves.toMatchObject({
      id: created.id,
      metadataVersion: 2,
      categoryId: 'technology',
    });
    const after = await client.execute({
      sql: 'SELECT package_hash, ingest_metadata_hash FROM public_books WHERE id = ?',
      args: [created.id],
    });
    expect(after.rows).toEqual(before.rows);
    await expect(
      repository.updateCatalog(created.id, {
        metadataVersion: 1,
        categoryId: 'thought',
        tagIds: [],
        collectionPath: '',
      }),
    ).rejects.toMatchObject({
      code: 'CATALOG_METADATA_VERSION_STALE',
      currentMetadataVersion: 2,
    });
    await expect(
      client.execute({
        sql: "UPDATE public_books SET category_id = 'unknown' WHERE id = ?",
        args: [created.id],
      }),
    ).rejects.toThrow();
    for (const tagId of ['jing', 'history', 'masters']) {
      await client.execute({
        sql: 'INSERT INTO public_book_tags (book_id, tag_id) VALUES (?, ?)',
        args: [created.id, tagId],
      });
    }
    await expect(
      client.execute({
        sql: "INSERT INTO public_book_tags (book_id, tag_id) VALUES (?, 'collections')",
        args: [created.id],
      }),
    ).rejects.toThrow('PUBLIC_LIBRARY_TAG_LIMIT_EXCEEDED');
    await expect(
      client.execute({
        sql: "INSERT INTO public_book_tags (book_id, tag_id) VALUES (?, 'unknown')",
        args: [created.id],
      }),
    ).rejects.toThrow();
    await expect(
      client.execute({
        sql: "UPDATE public_book_tags SET tag_id = 'unknown' WHERE book_id = ? AND tag_id = 'programming'",
        args: [created.id],
      }),
    ).rejects.toThrow('PUBLIC_LIBRARY_TAG_INVALID');
    const source = await repository.publishTxt({
      title: '标签迁移来源',
      category: '其他',
      tagIds: ['fiction'],
      content: '独立正文',
      rightsConfirmed: true,
    });
    await expect(
      client.execute({
        sql: `UPDATE public_book_tags SET book_id = ?
          WHERE book_id = ? AND tag_id = 'fiction'`,
        args: [created.id, source.id],
      }),
    ).rejects.toThrow('PUBLIC_LIBRARY_TAG_LIMIT_EXCEEDED');
    await expect(
      client.execute({
        sql: "UPDATE public_books SET ingest_category_id = 'unknown' WHERE id = ?",
        args: [created.id],
      }),
    ).rejects.toThrow('PUBLIC_LIBRARY_INGEST_CATEGORY_INVALID');
    await expect(repository.getPackage(created.id)).resolves.toMatchObject({
      book: { metadataVersion: 2, categoryId: 'technology' },
    });
  });

  it('paginates facets under the same catalog revision gate', async () => {
    const classics = await repository.publishTxt({
      title: '经部索引',
      category: '经典',
      tagIds: ['jing'],
      content: '正文一',
      rightsConfirmed: true,
    });
    const first = await repository.list({
      q: '',
      page: 1,
      pageSize: 1,
    });
    expect(first).toMatchObject({ total: 1, snapshotRevision: 1 });
    const programming = await repository.publishTxt({
      title: '编程索引',
      category: '技术',
      tagIds: ['programming', 'masters'],
      content: '正文二',
      rightsConfirmed: true,
    });
    expect(programming.publishedAt).toBe(classics.publishedAt);
    await repository.updateCatalog(classics.id, {
      metadataVersion: 1,
      categoryId: 'literature',
      tagIds: ['poetry'],
      collectionPath: '',
    });
    await expect(
      repository.list({
        q: '',
        page: 2,
        pageSize: 1,
        snapshotRevision: first.snapshotRevision,
      }),
    ).rejects.toThrow('PUBLIC_LIBRARY_CATALOG_SNAPSHOT_STALE');
    for (const view of ['maintainers', 'categories', 'tags'] as const) {
      await expect(
        repository.listFacets({
          view,
          q: '',
          page: 2,
          pageSize: 1,
          snapshotRevision: first.snapshotRevision,
        }),
      ).rejects.toThrow('PUBLIC_LIBRARY_CATALOG_SNAPSHOT_STALE');
    }
    const restartedFirst = await repository.list({
      q: '',
      page: 1,
      pageSize: 1,
    });
    const restartedSecond = await repository.list({
      q: '',
      page: 2,
      pageSize: 1,
      snapshotRevision: restartedFirst.snapshotRevision,
    });
    expect(restartedFirst).toMatchObject({ total: 2, snapshotRevision: 3 });
    expect(restartedSecond.total).toBe(2);
    expect(
      new Set(
        [...restartedFirst.items, ...restartedSecond.items].map(
          (book) => book.id,
        ),
      ).size,
    ).toBe(2);
    for (const view of ['maintainers', 'categories', 'tags'] as const) {
      const facetFirst = await repository.listFacets({
        view,
        q: '',
        page: 1,
        pageSize: 1,
      });
      const ids = [...facetFirst.items.map((item) => item.id)];
      for (let page = 2; page <= facetFirst.totalPages; page += 1) {
        const next = await repository.listFacets({
          view,
          q: '',
          page,
          pageSize: 1,
          snapshotRevision: facetFirst.snapshotRevision,
        });
        ids.push(...next.items.map((item) => item.id));
      }
      expect(new Set(ids).size).toBe(facetFirst.total);
      expect(facetFirst.snapshotRevision).toBe(3);
    }
    await expect(
      repository.listFacets({
        view: 'tags',
        q: '⼦',
        page: 1,
        pageSize: 24,
      }),
    ).resolves.toMatchObject({
      items: [{ id: 'masters', label: '子部', bookCount: 1 }],
    });
  });

  it('linearizes competing metadata versions with one winner and one revision', async () => {
    const created = await repository.publishTxt({
      title: '目录并发样本',
      category: '其他',
      content: '并发正文',
      rightsConfirmed: true,
    });
    const results = await Promise.allSettled([
      repository.updateCatalog(created.id, {
        metadataVersion: 1,
        categoryId: 'literature',
        tagIds: ['fiction'],
        collectionPath: '甲',
      }),
      repository.updateCatalog(created.id, {
        metadataVersion: 1,
        categoryId: 'thought',
        tagIds: ['masters'],
        collectionPath: '乙',
      }),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    expect(
      results.find((result) => result.status === 'rejected'),
    ).toMatchObject({
      reason: { code: 'CATALOG_METADATA_VERSION_STALE' },
    });
    await expect(
      client.execute('SELECT revision FROM public_catalog_state WHERE id = 1'),
    ).resolves.toMatchObject({ rows: [{ revision: 2 }] });
    await expect(repository.getPackage(created.id)).resolves.toMatchObject({
      book: { metadataVersion: 2 },
    });
  });

  it('does not attach losing provenance from an in-process metadata race', async () => {
    const canonical = {
      title: '同进程目录竞态',
      category: '经典' as const,
      chapters: [{ index: 0, title: '正文', content: '同一正文' }],
      wordCount: 4,
    };
    const results = await Promise.allSettled([
      repository.publishCandidate({
        ...canonical,
        source: {
          kind: 'browser_file',
          scope: 'left',
          relativePath: '甲/book.txt',
          bytes: Buffer.from('左来源'),
        },
      }),
      repository.publishCandidate({
        ...canonical,
        source: {
          kind: 'browser_file',
          scope: 'right',
          relativePath: '乙/book.txt',
          bytes: Buffer.from('右来源'),
        },
      }),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    await expect(
      client.execute('SELECT COUNT(*) AS total FROM public_sources'),
    ).resolves.toMatchObject({ rows: [{ total: 1 }] });
    await expect(
      client.execute('SELECT COUNT(*) AS total FROM public_ingest_receipts'),
    ).resolves.toMatchObject({ rows: [{ total: 1 }] });
  });

  it('uses the same NFKC shadow text for short and trigram searches', async () => {
    await repository.publishTxt({
      title: 'ＡＢＣ测试',
      category: '其他',
      content: '规范化正文',
      rightsConfirmed: true,
    });
    for (const q of ['ＡＢ', 'AB', 'ＡＢＣ', 'ABC']) {
      await expect(
        repository.list({ q, page: 1, pageSize: 24 }),
      ).resolves.toMatchObject({ total: 1 });
    }
  });

  it('uses the reverse tag index before reading matching books', async () => {
    const tagged = await repository.publishTxt({
      title: '反向索引样本',
      category: '技术',
      tagIds: ['product'],
      content: '索引正文',
      rightsConfirmed: true,
    });
    await expect(
      repository.list({
        q: '',
        tagId: 'product',
        page: 1,
        pageSize: 24,
      }),
    ).resolves.toMatchObject({ items: [{ id: tagged.id }], total: 1 });
    const plan = await client.execute({
      sql: `EXPLAIN QUERY PLAN SELECT b.id FROM public_books b
        WHERE b.id IN (
          SELECT book_id FROM public_book_tags WHERE tag_id = ?
        )`,
      args: ['product'],
    });
    expect(
      plan.rows
        .map((row) => (typeof row.detail === 'string' ? row.detail : ''))
        .join('\n'),
    ).toContain('public_book_tags_tag_book_idx');
  });

  it('fails closed when legacy category or maintainer identity drifts', async () => {
    const legacyPath = join(root, 'invalid-legacy.sqlite');
    const legacyClient = createClient({ url: `file:${legacyPath}` });
    try {
      await legacyClient.execute(`CREATE TABLE public_books (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, author TEXT, description TEXT,
        format TEXT NOT NULL, category TEXT NOT NULL, chapter_count INTEGER NOT NULL,
        word_count INTEGER NOT NULL, content_hash TEXT NOT NULL,
        package_hash TEXT NOT NULL UNIQUE, published_at TEXT NOT NULL
      )`);
      await legacyClient.execute(
        `INSERT INTO public_books (
        id, title, format, category, chapter_count, word_count,
        content_hash, package_hash, published_at
      ) VALUES ('legacy', '旧书', 'txt', '未分类', 1, 2, ?, ?, ?)`,
        ['a'.repeat(64), 'b'.repeat(64), '2026-08-15T00:00:00.000Z'],
      );
      await expect(preparePublicLibraryDatabase(legacyClient)).rejects.toThrow(
        'PUBLIC_LIBRARY_CATEGORY_MIGRATION_FAILED',
      );
    } finally {
      legacyClient.close();
    }

    await client.execute(
      "UPDATE public_maintainers SET label = '伪装账号' WHERE id = 1",
    );
    await expect(preparePublicLibraryDatabase(client)).rejects.toThrow(
      'PUBLIC_LIBRARY_MAINTAINER_DRIFT',
    );
  });
});
