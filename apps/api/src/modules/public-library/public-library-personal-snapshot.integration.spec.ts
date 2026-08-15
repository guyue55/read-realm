import { createClient, type Client } from '@libsql/client';
import { createHash } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalFileBlobStorage } from '@reader/storage-core/node';
import {
  serializePersonalPublicationSnapshotDescriptor,
  type VerifiedPersonalPublicationSnapshot,
} from '@reader/shared-types';
import {
  preparePublicLibraryDatabase,
  PublicLibraryRepository,
} from './public-library.repository';
import { PublicLibraryService } from './public-library.service';

const hash = (value: string | Buffer) =>
  createHash('sha256').update(value).digest('hex');

function verifiedSnapshot(): VerifiedPersonalPublicationSnapshot {
  const chapters = [
    {
      index: 0,
      title: '第一章',
      content: '甲卷正文',
      contentHash: hash('甲卷正文'),
    },
    {
      index: 1,
      title: '第二章',
      content: '乙卷正文',
      contentHash: hash('乙卷正文'),
    },
  ];
  const descriptor = {
    schemaVersion: 1 as const,
    sourceRef: 'b'.repeat(64),
    book: {
      title: '云上书',
      author: '作者',
      description: '说明',
      format: 'txt' as const,
      chapterCount: 2,
    },
    chapters: chapters.map((chapter) => ({
      index: chapter.index,
      title: chapter.title,
      contentHash: chapter.contentHash,
    })),
  };
  return {
    ...descriptor,
    snapshotHash: hash(
      serializePersonalPublicationSnapshotDescriptor(descriptor),
    ),
    chapters,
  };
}

describe('public library verified personal snapshot publication', () => {
  let client: Client;
  let root: string;
  let service: PublicLibraryService;
  let repository: PublicLibraryRepository;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'public-personal-snapshot-'));
    client = createClient({ url: `file:${join(root, 'catalog.sqlite')}` });
    await preparePublicLibraryDatabase(client);
    repository = new PublicLibraryRepository(
      client,
      new LocalFileBlobStorage(join(root, 'objects')),
      () => '2026-08-15T09:30:00.000Z',
    );
    service = new PublicLibraryService(repository, 'configured-key');
  });

  afterEach(async () => {
    client.close();
    await rm(root, { recursive: true, force: true });
  });

  function upload(snapshot = verifiedSnapshot()) {
    const buffer = Buffer.from(JSON.stringify(snapshot));
    return service.publishPersonalSnapshot(
      'configured-key',
      { category: '其他', rightsConfirmed: true },
      {
        originalname: 'verified-personal-snapshot.json',
        mimetype: 'application/json',
        size: buffer.length,
        buffer,
      },
    );
  }

  it('recomputes the snapshot and publishes personal_cloud provenance idempotently', async () => {
    const first = await upload();
    const second = await upload();

    expect(first.outcome).toBe('created');
    expect(second).toEqual({ outcome: 'unchanged', book: first.book });
    await expect(repository.getPackage(first.book.id)).resolves.toMatchObject({
      book: { title: '云上书', category: '其他' },
      chapters: [
        { index: 0, content: '甲卷正文' },
        { index: 1, content: '乙卷正文' },
      ],
    });
    const facts = await client.execute(
      'SELECT source_kind, source_scope, relative_path FROM public_sources',
    );
    expect(facts.rows).toEqual([
      {
        source_kind: 'personal_cloud',
        source_scope: 'personal-cloud',
        relative_path: `personal-${'b'.repeat(64)}.txt`,
      },
    ]);
    expect(JSON.stringify(facts.rows)).not.toContain('share-token');
    expect(JSON.stringify(facts.rows)).not.toContain('book-1');
    await expect(
      client.execute('SELECT revision FROM public_catalog_state WHERE id=1'),
    ).resolves.toMatchObject({ rows: [{ revision: 1 }] });
  });

  it.each([
    [
      'snapshot hash',
      (value: VerifiedPersonalPublicationSnapshot) => ({
        ...value,
        snapshotHash: '0'.repeat(64),
      }),
    ],
    [
      'chapter hash',
      (value: VerifiedPersonalPublicationSnapshot) => ({
        ...value,
        chapters: value.chapters.map((chapter, index) =>
          index === 0 ? { ...chapter, contentHash: '0'.repeat(64) } : chapter,
        ),
      }),
    ],
    [
      'chapter index',
      (value: VerifiedPersonalPublicationSnapshot) => ({
        ...value,
        chapters: value.chapters.map((chapter, index) =>
          index === 1 ? { ...chapter, index: 3 } : chapter,
        ),
      }),
    ],
  ])('rejects a tampered %s with zero public facts', async (_name, tamper) => {
    await expect(upload(tamper(verifiedSnapshot()))).rejects.toMatchObject({
      status: 400,
    });
    await expect(
      client.execute('SELECT COUNT(*) AS total FROM public_books'),
    ).resolves.toMatchObject({ rows: [{ total: 0 }] });
    await expect(
      client.execute('SELECT COUNT(*) AS total FROM public_sources'),
    ).resolves.toMatchObject({ rows: [{ total: 0 }] });
    await expect(
      readdir(join(root, 'objects')).catch(() => []),
    ).resolves.toEqual([]);
  });
});
