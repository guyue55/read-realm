import {
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
