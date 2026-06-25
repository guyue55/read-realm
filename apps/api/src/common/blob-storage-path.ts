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
