import { createClient, type Client } from '@libsql/client';
import { LocalFileBlobStorage } from '@reader/storage-core/node';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  preparePublicLibraryDatabase,
  PublicLibraryRepository,
} from './public-library.repository';
import { PublicLibraryService } from './public-library.service';

describe('public library direct TXT publication', () => {
  let client: Client;
  let root: string;
  let blobs: LocalFileBlobStorage;
  let repository: PublicLibraryRepository;
  let service: PublicLibraryService;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'public-library-file-'));
    client = createClient({ url: `file:${join(root, 'catalog.sqlite')}` });
    await preparePublicLibraryDatabase(client);
    blobs = new LocalFileBlobStorage(join(root, 'objects'));
    repository = new PublicLibraryRepository(
      client,
      blobs,
      () => '2026-08-15T07:30:00.000Z',
    );
    service = new PublicLibraryService(repository, 'configured-key');
  });

  afterEach(async () => {
    client.close();
    await rm(root, { recursive: true, force: true });
  });

  it('publishes through browser-file provenance and replays without duplicates', async () => {
    const original = Buffer.from(
      '第一章 入阁\n浏览器正文一\n\n第二章 继续\n浏览器正文二',
    );
    const before = Buffer.from(original);
    const fields = {
      title: '直传整书',
      category: '经典' as const,
      rightsConfirmed: true as const,
    };
    const file = {
      originalname: 'direct.txt',
      mimetype: 'text/plain',
      size: original.length,
      buffer: original,
    };

    const first = await service.publishFile('configured-key', fields, file);
    const second = await service.publishFile('configured-key', fields, file);

    expect(first.outcome).toBe('created');
    expect(second).toEqual({ outcome: 'unchanged', book: first.book });
    expect(original).toEqual(before);
    await expect(repository.getPackage(first.book.id)).resolves.toMatchObject({
      book: { id: first.book.id, title: '直传整书' },
      chapters: [
        { index: 0, content: '浏览器正文一' },
        { index: 1, content: '浏览器正文二' },
      ],
    });
    await expect(
      repository.list({ q: '', page: 1, pageSize: 24 }),
    ).resolves.toMatchObject({ total: 1, snapshotRevision: 1 });
    await expect(
      client.execute(
        `SELECT source_kind, source_scope, relative_path
          FROM public_sources`,
      ),
    ).resolves.toMatchObject({
      rows: [
        {
          source_kind: 'browser_file',
          source_scope: 'direct-upload',
          relative_path: 'direct.txt',
        },
      ],
    });
    await expect(
      client.execute('SELECT COUNT(*) AS total FROM public_ingest_receipts'),
    ).resolves.toMatchObject({ rows: [{ total: 1 }] });
  });

  it('persists folder source and collection paths without changing the source bytes', async () => {
    const original = Buffer.from('第一章\n文件夹正文');
    const before = Buffer.from(original);
    const publication = await service.publishFile(
      'configured-key',
      {
        category: '经典',
        relativePath: '古籍/经部/folder-book.txt',
        rightsConfirmed: true,
      },
      {
        originalname: 'folder-book.txt',
        mimetype: 'text/plain',
        size: original.length,
        buffer: original,
      },
    );
    expect(original).toEqual(before);
    const saved = await client.execute(
      'SELECT package_hash FROM public_books LIMIT 1',
    );
    const packageHash = saved.rows[0]?.package_hash;
    expect(typeof packageHash).toBe('string');
    if (typeof packageHash !== 'string')
      throw new Error('PACKAGE_HASH_MISSING');
    const immutablePackage = await blobs.getObject(packageHash);
    expect(immutablePackage.toString('utf8')).not.toContain('古籍');
    await expect(
      repository.getPackage(publication.book.id),
    ).resolves.toMatchObject({ book: { collectionPath: '古籍' } });
    await expect(
      client.execute(
        `SELECT b.collection_path, s.source_scope, s.relative_path
         FROM public_books b JOIN public_sources s ON s.book_id = b.id`,
      ),
    ).resolves.toMatchObject({
      rows: [
        {
          collection_path: '古籍',
          source_scope: 'browser-folder',
          relative_path: '古籍/经部/folder-book.txt',
        },
      ],
    });
  });

  it('reports a collection conflict instead of silently ignoring a later folder path', async () => {
    const original = Buffer.from('第一章\n同版正文');
    const directFile = {
      originalname: 'same-book.txt',
      mimetype: 'text/plain',
      size: original.length,
      buffer: original,
    };
    await service.publishFile(
      'configured-key',
      { category: '经典', rightsConfirmed: true },
      directFile,
    );
    await expect(
      service.publishFile(
        'configured-key',
        {
          category: '经典',
          relativePath: '古籍/经部/same-book.txt',
          rightsConfirmed: true,
        },
        directFile,
      ),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      client.execute('SELECT collection_path FROM public_books'),
    ).resolves.toMatchObject({ rows: [{ collection_path: '' }] });
    await expect(
      client.execute('SELECT COUNT(*) AS total FROM public_sources'),
    ).resolves.toMatchObject({ rows: [{ total: 1 }] });
  });
});
