import { lstat, realpath } from 'node:fs/promises';
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
) {
  if (!raw?.trim()) return { roots: [], publicRoots: [] };
  const storageTargets = await Promise.all(
    [
      isolation.personalDatabasePath,
      isolation.publicDatabasePath,
      isolation.personalBlobPath,
      isolation.publicBlobPath,
    ].map(resolvePhysicalTarget),
  );
  const roots: PublicLibraryMaintenanceRoot[] = [];
  for (const [rootId, configured] of parseConfiguredRoots(raw)) {
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
