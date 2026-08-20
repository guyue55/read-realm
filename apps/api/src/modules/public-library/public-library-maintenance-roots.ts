import { lstat, readFile, realpath } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  isAbsolute,
  dirname,
  basename,
  join,
  relative,
  resolve,
} from 'node:path';

export interface PublicLibraryMaintenanceIsolation {
  personalDatabasePath: string;
  publicDatabasePath: string;
  personalBlobPath: string;
  publicBlobPath: string;
}

export interface PublicLibraryMaintenanceRoot {
  rootId: string;
  label: string;
  absolutePath: string;
  realPath: string;
  configFingerprint: string;
}

export interface PublicLibraryMaintenanceRootSummary {
  rootId: string;
  label: string;
}

interface ConfiguredRoot {
  label?: unknown;
  path?: unknown;
}

const MAX_CONFIG_BYTES = 1024 * 1024; // 1 MB 安全上限

const DEFAULT_CONFIG_FILES = [
  'data/public-library-roots.json',
  'library-roots.json',
  'public-library-roots.json',
];

function containsPath(parent: string, candidate: string) {
  const pathFromParent = relative(resolve(parent), resolve(candidate));
  return (
    pathFromParent === '' ||
    (!pathFromParent.startsWith('..') && !isAbsolute(pathFromParent))
  );
}

async function resolvePhysicalTarget(input: string) {
  let cursor = resolve(input);
  const missingSegments: string[] = [];
  while (true) {
    try {
      return join(await realpath(cursor), ...missingSegments.reverse());
    } catch (error) {
      if (
        !(
          error instanceof Error &&
          'code' in error &&
          (error.code === 'ENOENT' || error.code === 'ENOTDIR')
        )
      ) {
        throw error;
      }
      const parent = dirname(cursor);
      if (parent === cursor) throw error;
      missingSegments.push(basename(cursor));
      cursor = parent;
    }
  }
}

async function tryReadConfigFile(
  filePath: string,
): Promise<string | undefined> {
  const resolvedPath = resolve(filePath);
  try {
    const status = await lstat(resolvedPath);
    if (!status.isFile() || status.isSymbolicLink()) {
      return undefined;
    }
    if (status.size > MAX_CONFIG_BYTES) {
      throw new Error('PUBLIC_LIBRARY_MAINTENANCE_ROOTS_INVALID');
    }
    return await readFile(resolvedPath, 'utf8');
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === 'PUBLIC_LIBRARY_MAINTENANCE_ROOTS_INVALID'
    ) {
      throw error;
    }
    return undefined;
  }
}

export async function detectMaintenanceRootsRaw(
  rawEnv: string | undefined,
  explicitFileEnv: string | undefined = process.env
    .READER_PUBLIC_LIBRARY_MAINTENANCE_ROOTS_FILE,
  baseDir: string = process.cwd(),
): Promise<string | undefined> {
  // 1. 显式指定的文件路径优先
  if (explicitFileEnv?.trim()) {
    const targetFile = resolve(baseDir, explicitFileEnv.trim());
    const content = await tryReadConfigFile(targetFile);
    if (content !== undefined) return content;
    throw new Error('PUBLIC_LIBRARY_MAINTENANCE_ROOTS_INVALID');
  }

  // 2. 环境变量字符串（若为 json 文件路径则读文件，否则按原始 JSON 字符串解析）
  if (rawEnv?.trim()) {
    const trimmed = rawEnv.trim();
    const candidateFile = resolve(baseDir, trimmed);
    if (trimmed.endsWith('.json') || existsSync(candidateFile)) {
      const content = await tryReadConfigFile(candidateFile);
      if (content !== undefined) return content;
    }
    return trimmed;
  }

  // 3. 自动探测默认位置的 JSON 配置文件
  for (const defaultFile of DEFAULT_CONFIG_FILES) {
    const candidatePath = resolve(baseDir, defaultFile);
    const content = await tryReadConfigFile(candidatePath);
    if (content !== undefined) return content;
  }

  return undefined;
}

function parseConfiguredRoots(raw: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('PUBLIC_LIBRARY_MAINTENANCE_ROOTS_INVALID');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('PUBLIC_LIBRARY_MAINTENANCE_ROOTS_INVALID');
  }
  return Object.entries(parsed as Record<string, ConfiguredRoot>);
}

function containsControlCharacter(value: string) {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
}

export async function resolvePublicLibraryMaintenanceRoots(
  raw: string | undefined,
  isolation: PublicLibraryMaintenanceIsolation,
  explicitFilePath?: string,
  baseDir?: string,
) {
  const effectiveRaw = await detectMaintenanceRootsRaw(
    raw,
    explicitFilePath,
    baseDir,
  );
  if (!effectiveRaw?.trim()) return { roots: [], publicRoots: [] };
  const storageTargets = await Promise.all(
    [
      isolation.personalDatabasePath,
      isolation.publicDatabasePath,
      isolation.personalBlobPath,
      isolation.publicBlobPath,
    ].map(resolvePhysicalTarget),
  );
  const roots: PublicLibraryMaintenanceRoot[] = [];
  for (const [rootId, configured] of parseConfiguredRoots(effectiveRaw)) {
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/u.test(rootId)) {
      throw new Error('PUBLIC_LIBRARY_MAINTENANCE_ROOT_ID_INVALID');
    }
    const label =
      typeof configured?.label === 'string' ? configured.label.trim() : '';
    const absolutePath =
      typeof configured?.path === 'string' ? configured.path : '';
    if (
      !label ||
      label.length > 80 ||
      /[\\/]/u.test(label) ||
      containsControlCharacter(label) ||
      /^[a-z]:/iu.test(label)
    ) {
      throw new Error('PUBLIC_LIBRARY_MAINTENANCE_ROOT_LABEL_INVALID');
    }
    if (!absolutePath || !isAbsolute(absolutePath)) {
      throw new Error('PUBLIC_LIBRARY_MAINTENANCE_ROOT_PATH_INVALID');
    }
    const rootStat = await lstat(absolutePath);
    const realPath = await realpath(absolutePath);
    if (
      storageTargets.some(
        (storagePath) =>
          containsPath(realPath, storagePath) ||
          containsPath(storagePath, realPath),
      )
    ) {
      throw new Error('PUBLIC_LIBRARY_MAINTENANCE_ROOT_STORAGE_OVERLAP');
    }
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
      throw new Error('PUBLIC_LIBRARY_MAINTENANCE_ROOT_PATH_INVALID');
    }
    if (
      roots.some(
        (root) =>
          containsPath(root.realPath, realPath) ||
          containsPath(realPath, root.realPath),
      )
    ) {
      throw new Error('PUBLIC_LIBRARY_MAINTENANCE_ROOTS_OVERLAP');
    }
    roots.push({
      rootId,
      label,
      absolutePath: resolve(absolutePath),
      realPath,
      configFingerprint: createHash('sha256')
        .update(`${rootId}\0${realPath}\0${rootStat.dev}\0${rootStat.ino}`)
        .digest('hex'),
    });
  }
  roots.sort((left, right) => left.rootId.localeCompare(right.rootId, 'en'));
  return {
    roots,
    publicRoots: roots.map(({ rootId, label }) => ({ rootId, label })),
  };
}
