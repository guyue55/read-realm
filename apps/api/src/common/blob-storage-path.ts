import * as path from 'path';

/**
 * 🏮 章节正文 Blob 物理沙盒的统一定位入口。
 *
 * 旧版本各模块各自写 `process.cwd() + '../../data/...'`，
 * 一旦 CWD 不在 `apps/api`（如 monorepo 顶层 nest start、Docker、Tauri 子进程）就会把
 * blob 写进错误目录，造成"导入完阅读时章节内容找不到"的诡异故障。
 *
 * 优先级：
 * 1. `READER_BLOB_STORAGE_PATH` 环境变量（运维显式指定）。
 * 2. `__dirname` 反推：apps/api/{src|dist}/common -> 仓库根 `data/storage/chapter_blobs`。
 * 3. 最终兜底走旧逻辑 `process.cwd()`，保留向后兼容。
 */
export function resolveBlobStoragePath(): string {
  const fromEnv = process.env.READER_BLOB_STORAGE_PATH;
  if (fromEnv && fromEnv.trim().length > 0) {
    return path.resolve(fromEnv);
  }

  // __dirname 在 src 编译产物里通常是 .../apps/api/dist/common，
  // 在 ts-node/jest 下是 .../apps/api/src/common。两者向上 4 级都能到达仓库根。
  try {
    const repoRoot = path.resolve(__dirname, '../../../..');
    return path.join(repoRoot, 'data', 'storage', 'chapter_blobs');
  } catch {
    return path.resolve(process.cwd(), '../../data/storage/chapter_blobs/');
  }
}

/**
 * 🏮 同样的逻辑兜底 SQLite 数据库文件位置。
 * 优先级：`READER_SQLITE_DB_PATH` 环境变量 -> 仓库根 `data/app.sqlite` -> CWD 推断。
 */
export function resolveSqliteDbPath(): string {
  const fromEnv = process.env.READER_SQLITE_DB_PATH;
  if (fromEnv && fromEnv.trim().length > 0) {
    return path.resolve(fromEnv);
  }

  try {
    const repoRoot = path.resolve(__dirname, '../../../..');
    return path.join(repoRoot, 'data', 'app.sqlite');
  } catch {
    return path.resolve(process.cwd(), '../../data/app.sqlite');
  }
}

export function resolvePublicLibraryBlobStoragePath(): string {
  const fromEnv = process.env.READER_PUBLIC_LIBRARY_BLOB_STORAGE_PATH;
  if (fromEnv?.trim()) return path.resolve(fromEnv);
  return path.join(
    path.resolve(__dirname, '../../../..'),
    'data',
    'public-library',
    'objects',
  );
}

export function resolvePublicLibrarySqliteDbPath(): string {
  const fromEnv = process.env.READER_PUBLIC_LIBRARY_DB_PATH;
  if (fromEnv?.trim()) return path.resolve(fromEnv);
  return path.join(
    path.resolve(__dirname, '../../../..'),
    'data',
    'public-library',
    'catalog.sqlite',
  );
}

function containsPath(parent: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return (
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative))
  );
}

export function assertPublicLibraryStorageIsolation(input: {
  personalDatabasePath: string;
  publicDatabasePath: string;
  personalBlobPath: string;
  publicBlobPath: string;
}): void {
  if (
    path.resolve(input.personalDatabasePath) ===
    path.resolve(input.publicDatabasePath)
  ) {
    throw new Error('PUBLIC_LIBRARY_DATABASE_MUST_BE_ISOLATED');
  }
  if (
    containsPath(input.personalBlobPath, input.publicBlobPath) ||
    containsPath(input.publicBlobPath, input.personalBlobPath)
  ) {
    throw new Error('PUBLIC_LIBRARY_BLOB_ROOT_MUST_BE_ISOLATED');
  }
  if (
    [input.personalDatabasePath, input.publicDatabasePath].some(
      (databasePath) =>
        containsPath(input.personalBlobPath, databasePath) ||
        containsPath(input.publicBlobPath, databasePath),
    )
  ) {
    throw new Error('PUBLIC_LIBRARY_DATABASE_MUST_NOT_BE_INSIDE_BLOB_ROOT');
  }
}

export function assertResolvedPublicLibraryStorageIsolation(): void {
  assertPublicLibraryStorageIsolation({
    personalDatabasePath: resolveSqliteDbPath(),
    publicDatabasePath: resolvePublicLibrarySqliteDbPath(),
    personalBlobPath: resolveBlobStoragePath(),
    publicBlobPath: resolvePublicLibraryBlobStoragePath(),
  });
}
