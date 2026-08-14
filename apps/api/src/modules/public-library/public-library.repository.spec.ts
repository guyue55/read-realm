import { createClient, type Client } from '@libsql/client';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalFileBlobStorage } from '@reader/storage-core/node';
import {
  preparePublicLibraryDatabase,
  PublicLibraryRepository,
} from './public-library.repository';

describe('PublicLibraryRepository', () => {
  let client: Client;
  let root: string;
  let repository: PublicLibraryRepository;

  beforeEach(async () => {
    client = createClient({ url: 'file::memory:' });
    root = await mkdtemp(join(tmpdir(), 'public-library-'));
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
    });
  });
});
