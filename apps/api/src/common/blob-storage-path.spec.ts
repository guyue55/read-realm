import * as path from 'path';
import { resolveBlobStoragePath } from './blob-storage-path';

describe('resolveBlobStoragePath', () => {
  const originalEnv = process.env.READER_BLOB_STORAGE_PATH;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.READER_BLOB_STORAGE_PATH;
    } else {
      process.env.READER_BLOB_STORAGE_PATH = originalEnv;
    }
  });

  it('优先返回 READER_BLOB_STORAGE_PATH 环境变量', () => {
    process.env.READER_BLOB_STORAGE_PATH = '/tmp/custom-blobs';
    expect(resolveBlobStoragePath()).toBe(path.resolve('/tmp/custom-blobs'));
  });

  it('环境变量缺省时回到仓库根的 data/storage/chapter_blobs', () => {
    delete process.env.READER_BLOB_STORAGE_PATH;
    const resolved = resolveBlobStoragePath();
    expect(resolved.endsWith(path.join('data', 'storage', 'chapter_blobs'))).toBe(true);
    expect(path.isAbsolute(resolved)).toBe(true);
  });
});
