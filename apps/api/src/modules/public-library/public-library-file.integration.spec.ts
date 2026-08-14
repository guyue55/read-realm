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
  let repository: PublicLibraryRepository;
  let service: PublicLibraryService;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'public-library-file-'));
    client = createClient({ url: `file:${join(root, 'catalog.sqlite')}` });
    await preparePublicLibraryDatabase(client);
    repository = new PublicLibraryRepository(
      client,
      new LocalFileBlobStorage(join(root, 'objects')),
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

    expect(second).toEqual(first);
    expect(original).toEqual(before);
    await expect(repository.getPackage(first.id)).resolves.toMatchObject({
      book: { id: first.id, title: '直传整书' },
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
});
