import * as path from 'path';
import { resolveBlobStoragePath, resolveSqliteDbPath } from './blob-storage-path';

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

describe('resolveSqliteDbPath', () => {
  const originalEnv = process.env.READER_SQLITE_DB_PATH;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.READER_SQLITE_DB_PATH;
    } else {
      process.env.READER_SQLITE_DB_PATH = originalEnv;
    }
  });

  it('优先返回 READER_SQLITE_DB_PATH 环境变量', () => {
    process.env.READER_SQLITE_DB_PATH = '/tmp/custom.sqlite';
    expect(resolveSqliteDbPath()).toBe(path.resolve('/tmp/custom.sqlite'));
  });

  it('环境变量缺省时回到仓库根 data/app.sqlite', () => {
    delete process.env.READER_SQLITE_DB_PATH;
    const resolved = resolveSqliteDbPath();
    expect(resolved.endsWith(path.join('data', 'app.sqlite'))).toBe(true);
    expect(path.isAbsolute(resolved)).toBe(true);
  });
});
