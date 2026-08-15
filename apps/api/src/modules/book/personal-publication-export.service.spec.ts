import { createHash } from 'node:crypto';
import type { LocalFileBlobStorage } from '@reader/storage-core/node';
import {
  PersonalPublicationExportService,
  type PersonalPublicationDbSnapshot,
  type PersonalPublicationExportRepository,
} from './personal-publication-export.service';

const hash = (value: string | Buffer) =>
  createHash('sha256').update(value).digest('hex');

function snapshot(
  content = ['甲卷正文', '乙卷正文'],
  token = 'private-a',
): PersonalPublicationDbSnapshot {
  return {
    scopedBookId: `book-1#${token}`,
    scopeSalt: '11'.repeat(32),
    book: {
      title: '云上书',
      author: '作者',
      description: '说明',
      format: 'txt',
      chapterCount: content.length,
    },
    chapters: content.map((body, index) => ({
      index,
      title: `第${index + 1}章`,
      contentHash: hash(body),
    })),
  };
}

function repository(read: () => PersonalPublicationDbSnapshot | null) {
  const readSnapshotMock = jest.fn(() => Promise.resolve(read()));
  return {
    readSnapshotMock,
    value: {
      readSnapshot: readSnapshotMock,
    } as unknown as PersonalPublicationExportRepository,
  };
}

function blobs(
  values: Record<string, Buffer | Error>,
  declaredSizes: Record<string, number> = {},
) {
  const getObjectMock = jest.fn((key: string) => {
    const value = values[key];
    if (!value) return Promise.reject(new Error('ENOENT'));
    if (value instanceof Error) return Promise.reject(value);
    return Promise.resolve(value);
  });
  const getObjectSizeMock = jest.fn((key: string) => {
    const declaredSize = declaredSizes[key];
    if (declaredSize !== undefined) return Promise.resolve(declaredSize);
    const value = values[key];
    if (!value) return Promise.reject(new Error('ENOENT'));
    if (value instanceof Error) return Promise.reject(value);
    return Promise.resolve(value.length);
  });
  return {
    getObjectMock,
    getObjectSizeMock,
    value: {
      getObject: getObjectMock,
      getObjectSize: getObjectSizeMock,
    } as unknown as LocalFileBlobStorage,
  };
}

describe('PersonalPublicationExportService', () => {
  it('returns a token-scoped, hash-verified page without private identity', async () => {
    const current = snapshot();
    const storage = blobs({
      [current.chapters[0].contentHash]: Buffer.from('甲卷正文'),
      [current.chapters[1].contentHash]: Buffer.from('乙卷正文'),
    });
    const source = repository(() => current);
    const service = new PersonalPublicationExportService(
      source.value,
      storage.value,
    );

    const page = await service.readPage({
      token: 'private-a',
      bookId: 'book-1',
      offset: 0,
      limit: 1,
      includeContent: true,
    });

    expect(page.items).toEqual([
      expect.objectContaining({
        index: 0,
        content: '甲卷正文',
        contentHash: hash('甲卷正文'),
        byteLength: Buffer.byteLength('甲卷正文'),
      }),
    ]);
    expect(page.snapshotHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(page.sourceRef).toMatch(/^[a-f0-9]{64}$/u);
    expect(JSON.stringify(page)).not.toContain('private-a');
    expect(JSON.stringify(page)).not.toContain('book-1');
    expect(source.readSnapshotMock).toHaveBeenCalledWith('book-1', 'private-a');
  });

  it('keeps serving the frozen verified receipt after the remote book changes', async () => {
    const generationA = snapshot();
    const generationB = snapshot(['新甲卷', '新乙卷']);
    let current = generationA;
    const storage = blobs({
      [generationA.chapters[0].contentHash]: Buffer.from('甲卷正文'),
      [generationA.chapters[1].contentHash]: Buffer.from('乙卷正文'),
      [generationB.chapters[0].contentHash]: Buffer.from('新甲卷'),
      [generationB.chapters[1].contentHash]: Buffer.from('新乙卷'),
    });
    const service = new PersonalPublicationExportService(
      repository(() => current).value,
      storage.value,
    );
    const first = await service.readPage({
      token: 'private-a',
      bookId: 'book-1',
      offset: 0,
      limit: 1,
      includeContent: false,
    });
    current = generationB;

    const second = await service.readPage({
      token: 'private-a',
      bookId: 'book-1',
      offset: 1,
      limit: 1,
      includeContent: true,
      expectedSnapshotHash: first.snapshotHash,
    });

    expect(second.snapshotHash).toBe(first.snapshotHash);
    expect(second.items).toEqual([
      expect.objectContaining({ index: 1, content: '乙卷正文' }),
    ]);
  });

  it.each([
    ['missing', undefined],
    ['empty', Buffer.alloc(0)],
    ['hash mismatch', Buffer.from('被篡改')],
    ['invalid utf8', Buffer.from([0xc3, 0x28])],
  ])(
    'rejects a %s Blob instead of returning an empty chapter',
    async (_name, body) => {
      const current = snapshot(['甲卷正文']);
      const source = repository(() => current);
      const storage = blobs(
        body === undefined ? {} : { [current.chapters[0].contentHash]: body },
      );
      const service = new PersonalPublicationExportService(
        source.value,
        storage.value,
      );

      await expect(
        service.readPage({
          token: 'private-a',
          bookId: 'book-1',
          offset: 0,
          limit: 1,
          includeContent: true,
        }),
      ).rejects.toMatchObject({ status: 422 });
    },
  );

  it.each(['', 'default'])(
    'rejects the reserved personal token %p',
    async (token) => {
      const source = repository(() => snapshot());
      const service = new PersonalPublicationExportService(
        source.value,
        blobs({}).value,
      );
      await expect(
        service.readPage({
          token,
          bookId: 'book-1',
          offset: 0,
          limit: 1,
          includeContent: false,
        }),
      ).rejects.toMatchObject({ status: 400 });
      expect(source.readSnapshotMock).not.toHaveBeenCalled();
    },
  );

  it('rejects partial or discontinuous metadata before reading any Blob', async () => {
    const current = snapshot();
    current.chapters[1] = { ...current.chapters[1], index: 2 };
    const storage = blobs({});
    const service = new PersonalPublicationExportService(
      repository(() => current).value,
      storage.value,
    );
    await expect(
      service.readPage({
        token: 'private-a',
        bookId: 'book-1',
        offset: 0,
        limit: 2,
        includeContent: false,
      }),
    ).rejects.toMatchObject({ status: 422 });
    expect(storage.getObjectMock).not.toHaveBeenCalled();
  });

  it('rejects a cumulative book size above 20 MiB before loading chapter bodies', async () => {
    const current = snapshot();
    const values = {
      [current.chapters[0].contentHash]: Buffer.from('甲卷正文'),
      [current.chapters[1].contentHash]: Buffer.from('乙卷正文'),
    };
    const storage = blobs(values, {
      [current.chapters[0].contentHash]: 11 * 1024 * 1024,
      [current.chapters[1].contentHash]: 11 * 1024 * 1024,
    });
    const service = new PersonalPublicationExportService(
      repository(() => current).value,
      storage.value,
    );

    await expect(
      service.readPage({
        token: 'private-a',
        bookId: 'book-1',
        offset: 0,
        limit: 2,
        includeContent: true,
      }),
    ).rejects.toMatchObject({ status: 413 });
    expect(storage.getObjectSizeMock).toHaveBeenCalledTimes(2);
    expect(storage.getObjectMock).not.toHaveBeenCalled();
  });

  it('verifies one O(N) receipt and reuses it across paged reads', async () => {
    const bodies = Array.from({ length: 401 }, (_, index) => `正文-${index}`);
    const current = snapshot(bodies);
    const values = Object.fromEntries(
      current.chapters.map((chapter, index) => [
        chapter.contentHash,
        Buffer.from(bodies[index]),
      ]),
    );
    const source = repository(() => current);
    const storage = blobs(values);
    const service = new PersonalPublicationExportService(
      source.value,
      storage.value,
    );

    const first = await service.readPage({
      token: 'private-a',
      bookId: 'book-1',
      offset: 0,
      limit: 200,
      includeContent: false,
    });
    await service.readPage({
      token: 'private-a',
      bookId: 'book-1',
      offset: 200,
      limit: 200,
      includeContent: true,
      expectedSnapshotHash: first.snapshotHash,
    });
    await service.readPage({
      token: 'private-a',
      bookId: 'book-1',
      offset: 400,
      limit: 1,
      includeContent: false,
      expectedSnapshotHash: first.snapshotHash,
    });

    expect(source.readSnapshotMock).toHaveBeenCalledTimes(1);
    expect(storage.getObjectSizeMock).toHaveBeenCalledTimes(401);
    expect(storage.getObjectMock).toHaveBeenCalledTimes(601);
  });
});
