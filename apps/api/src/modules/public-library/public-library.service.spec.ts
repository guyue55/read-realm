import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PublicLibraryDuplicateMetadataError } from './public-library.repository';
import { PublicLibraryService } from './public-library.service';

const input = {
  title: '权限样本',
  category: '其他' as const,
  content: '正文',
  rightsConfirmed: true as const,
};

describe('PublicLibraryService maintenance boundary', () => {
  const repository = {
    publishTxt: jest.fn(() => Promise.resolve({ id: 'public-1' })),
    publishCandidate: jest.fn(() => Promise.resolve({ id: 'public-file' })),
    list: jest.fn(),
    getPackage: jest.fn(),
  };

  beforeEach(() => jest.clearAllMocks());

  it.each([undefined, '', 'default', 'wrong'])(
    'rejects missing/default/wrong key: %p',
    async (key) => {
      const service = new PublicLibraryService(
        repository as never,
        'configured-key',
      );
      await expect(service.publish(key, input)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(repository.publishTxt).not.toHaveBeenCalled();
    },
  );

  it('rejects a same-character-count key with a different UTF-8 byte length', async () => {
    const service = new PublicLibraryService(repository as never, '藏');
    await expect(service.publish('x', input)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(repository.publishTxt).not.toHaveBeenCalled();
  });

  it('closes writes when the instance maintenance key is not configured', async () => {
    const service = new PublicLibraryService(repository as never, '');
    await expect(service.publish('anything', input)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('accepts only the configured public maintenance key', async () => {
    const service = new PublicLibraryService(
      repository as never,
      'configured-key',
    );
    await service.publish('configured-key', input);
    expect(repository.publishTxt).toHaveBeenCalledTimes(1);
  });

  it('returns a typed metadata conflict with the existing book id', async () => {
    repository.publishTxt.mockRejectedValueOnce(
      new PublicLibraryDuplicateMetadataError('public-existing'),
    );
    const service = new PublicLibraryService(
      repository as never,
      'configured-key',
    );
    const failure = await service
      .publish('configured-key', input)
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ConflictException);
    expect((failure as ConflictException).getResponse()).toMatchObject({
      code: 'duplicate_metadata_conflict',
      existingBookId: 'public-existing',
    });
  });

  it('adapts one verified TXT upload into the canonical publisher', async () => {
    const service = new PublicLibraryService(
      repository as never,
      'configured-key',
    );
    const content = Buffer.from('第一章 起点\n浏览器正文');
    await expect(
      service.publishFile(
        'configured-key',
        { category: '经典', rightsConfirmed: true },
        {
          originalname: '浏览器直传.txt',
          mimetype: 'text/plain',
          size: content.length,
          buffer: content,
        },
      ),
    ).resolves.toEqual({ id: 'public-file' });
    expect(repository.publishCandidate).toHaveBeenCalledWith({
      title: '浏览器直传',
      author: undefined,
      description: undefined,
      category: '经典',
      source: {
        kind: 'browser_file',
        scope: 'direct-upload',
        relativePath: '浏览器直传.txt',
        bytes: content,
      },
      chapters: [{ index: 0, title: '第一章 起点', content: '浏览器正文' }],
      wordCount: 5,
    });
  });

  it('rejects malformed file facts before the canonical publisher', async () => {
    const service = new PublicLibraryService(
      repository as never,
      'configured-key',
    );
    await expect(
      service.publishFile(
        'configured-key',
        { category: '经典', rightsConfirmed: true },
        {
          originalname: 'broken.txt',
          mimetype: 'text/plain',
          size: 3,
          buffer: Buffer.from('x'),
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.publishCandidate).not.toHaveBeenCalled();
  });

  it('rejects a TXT whose first explicit chapter has no body', async () => {
    const service = new PublicLibraryService(
      repository as never,
      'configured-key',
    );
    const content = Buffer.from('第一章\n第二章\n正文');
    await expect(
      service.publishFile(
        'configured-key',
        { category: '经典', rightsConfirmed: true },
        {
          originalname: 'empty-first.txt',
          mimetype: 'text/plain',
          size: content.length,
          buffer: content,
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.publishCandidate).not.toHaveBeenCalled();
  });

  it.each(['../escape.txt', '   .txt', 'line\nbreak.txt'])(
    'rejects unsafe filename %p even if transport sanitization is bypassed',
    async (originalname) => {
      const service = new PublicLibraryService(
        repository as never,
        'configured-key',
      );
      const content = Buffer.from('完整正文');
      await expect(
        service.publishFile(
          'configured-key',
          { category: '经典', rightsConfirmed: true },
          {
            originalname,
            mimetype: 'text/plain',
            size: content.length,
            buffer: content,
          },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.publishCandidate).not.toHaveBeenCalled();
    },
  );

  it('maps a stale catalog revision to an explicit restart response', async () => {
    repository.list.mockRejectedValueOnce(
      new Error('PUBLIC_LIBRARY_CATALOG_SNAPSHOT_STALE'),
    );
    const service = new PublicLibraryService(
      repository as never,
      'configured-key',
    );
    await expect(
      service.list({ q: '', page: 2, pageSize: 24, snapshotRevision: 1 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
