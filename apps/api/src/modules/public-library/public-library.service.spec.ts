import {
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
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
});
