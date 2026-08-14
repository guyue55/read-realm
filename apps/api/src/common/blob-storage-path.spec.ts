import * as path from 'path';
import {
  assertPublicLibraryStorageIsolation,
  resolveBlobStoragePath,
  resolvePublicLibraryBlobStoragePath,
  resolvePublicLibrarySqliteDbPath,
  resolveSqliteDbPath,
} from './blob-storage-path';

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
    expect(
      resolved.endsWith(path.join('data', 'storage', 'chapter_blobs')),
    ).toBe(true);
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

describe('assertPublicLibraryStorageIsolation', () => {
  const environment = {
    READER_SQLITE_DB_PATH: process.env.READER_SQLITE_DB_PATH,
    READER_PUBLIC_LIBRARY_DB_PATH: process.env.READER_PUBLIC_LIBRARY_DB_PATH,
    READER_BLOB_STORAGE_PATH: process.env.READER_BLOB_STORAGE_PATH,
    READER_PUBLIC_LIBRARY_BLOB_STORAGE_PATH:
      process.env.READER_PUBLIC_LIBRARY_BLOB_STORAGE_PATH,
  };

  afterEach(() => {
    for (const [key, value] of Object.entries(environment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('accepts distinct database files and disjoint blob roots', () => {
    expect(() =>
      assertPublicLibraryStorageIsolation({
        personalDatabasePath: '/srv/reader/private.sqlite',
        publicDatabasePath: '/srv/reader/public/catalog.sqlite',
        personalBlobPath: '/srv/reader/private-objects',
        publicBlobPath: '/srv/reader/public-objects',
      }),
    ).not.toThrow();
  });

  it('refuses a shared personal and public database file', () => {
    expect(() =>
      assertPublicLibraryStorageIsolation({
        personalDatabasePath: '/srv/reader/catalog.sqlite',
        publicDatabasePath: '/srv/reader/catalog.sqlite',
        personalBlobPath: '/srv/reader/private-objects',
        publicBlobPath: '/srv/reader/public-objects',
      }),
    ).toThrow('PUBLIC_LIBRARY_DATABASE_MUST_BE_ISOLATED');
  });

  it.each([
    ['/srv/reader/objects', '/srv/reader/objects'],
    ['/srv/reader/objects', '/srv/reader/objects/public'],
    ['/srv/reader/objects/private', '/srv/reader/objects'],
  ])(
    'refuses equal or overlapping blob roots: %s / %s',
    (personal, publicRoot) => {
      expect(() =>
        assertPublicLibraryStorageIsolation({
          personalDatabasePath: '/srv/reader/private.sqlite',
          publicDatabasePath: '/srv/reader/public.sqlite',
          personalBlobPath: personal,
          publicBlobPath: publicRoot,
        }),
      ).toThrow('PUBLIC_LIBRARY_BLOB_ROOT_MUST_BE_ISOLATED');
    },
  );

  it.each([
    ['/srv/reader/private-objects/private.sqlite', '/srv/reader/public.sqlite'],
    ['/srv/reader/private.sqlite', '/srv/reader/public-objects/catalog.sqlite'],
  ])(
    'refuses a database file inside either blob root: %s / %s',
    (personalDb, publicDb) => {
      expect(() =>
        assertPublicLibraryStorageIsolation({
          personalDatabasePath: personalDb,
          publicDatabasePath: publicDb,
          personalBlobPath: '/srv/reader/private-objects',
          publicBlobPath: '/srv/reader/public-objects',
        }),
      ).toThrow('PUBLIC_LIBRARY_DATABASE_MUST_NOT_BE_INSIDE_BLOB_ROOT');
    },
  );

  it('validates the actual resolved environment paths', () => {
    process.env.READER_SQLITE_DB_PATH = '/tmp/private.sqlite';
    process.env.READER_PUBLIC_LIBRARY_DB_PATH = '/tmp/public.sqlite';
    process.env.READER_BLOB_STORAGE_PATH = '/tmp/private-objects';
    process.env.READER_PUBLIC_LIBRARY_BLOB_STORAGE_PATH = '/tmp/public-objects';
    expect(() =>
      assertPublicLibraryStorageIsolation({
        personalDatabasePath: resolveSqliteDbPath(),
        publicDatabasePath: resolvePublicLibrarySqliteDbPath(),
        personalBlobPath: resolveBlobStoragePath(),
        publicBlobPath: resolvePublicLibraryBlobStoragePath(),
      }),
    ).not.toThrow();
  });
});
