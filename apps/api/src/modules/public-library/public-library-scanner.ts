import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, opendir, realpath } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { normalizePublicLibraryRelativePath } from './public-library.contract';
import {
  buildPublicLibraryFileCandidate,
  PublicLibraryFileCandidateError,
} from './public-library-file-candidate';
import type { PublicLibraryMaintenanceRoot } from './public-library-maintenance-roots';
import { PublicLibraryMaintenanceRootRegistry } from './public-library-maintenance-root-registry';
import {
  PublicLibraryDuplicateMetadataError,
  PublicLibraryRepository,
} from './public-library.repository';
import {
  PublicLibraryScanLeaseLostError,
  PublicLibraryScanRepository,
  type PublicLibraryScanItem,
  type PublicLibraryScanJob,
  type PublicLibraryScanProgress,
} from './public-library-scan.repository';

export interface PublicLibraryScanLimits {
  maxDepth: number;
  maxFiles: number;
  maxFileBytes: number;
  maxTotalBytes: number;
}

const defaultLimits: PublicLibraryScanLimits = {
  maxDepth: 32,
  maxFiles: 5_000,
  maxFileBytes: 20 * 1024 * 1024,
  maxTotalBytes: 2 * 1024 * 1024 * 1024,
};

function tightenedPositiveInteger(value: string | undefined, maximum: number) {
  if (!value?.trim()) return maximum;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0
    ? Math.min(parsed, maximum)
    : maximum;
}

export function resolvePublicLibraryScanLimits(
  environment: NodeJS.ProcessEnv = process.env,
): PublicLibraryScanLimits {
  return {
    maxDepth: tightenedPositiveInteger(
      environment.READER_PUBLIC_LIBRARY_SCAN_MAX_DEPTH,
      defaultLimits.maxDepth,
    ),
    maxFiles: tightenedPositiveInteger(
      environment.READER_PUBLIC_LIBRARY_SCAN_MAX_FILES,
      defaultLimits.maxFiles,
    ),
    maxFileBytes: tightenedPositiveInteger(
      environment.READER_PUBLIC_LIBRARY_SCAN_MAX_FILE_BYTES,
      defaultLimits.maxFileBytes,
    ),
    maxTotalBytes: tightenedPositiveInteger(
      environment.READER_PUBLIC_LIBRARY_SCAN_MAX_TOTAL_BYTES,
      defaultLimits.maxTotalBytes,
    ),
  };
}

interface InventoryFile {
  absolutePath: string;
  relativePath: string;
  dev: number;
  ino: number;
  nlink: number;
  size: number;
  mtimeMs: number;
  ctimeMs: number;
}

interface InventoryDirectory {
  absolutePath: string;
  dev: number;
  ino: number;
  mtimeMs: number;
  ctimeMs: number;
}

interface Inventory {
  files: InventoryFile[];
  directories: InventoryDirectory[];
  skipped: string[];
  totalBytes: number;
}

export class PublicLibraryScanFailure extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'PublicLibraryScanFailure';
  }
}

function emptyProgress(): PublicLibraryScanProgress {
  return {
    discoveredCount: 0,
    processedCount: 0,
    createdCount: 0,
    unchangedCount: 0,
    duplicateCount: 0,
    failedCount: 0,
    skippedCount: 0,
    totalBytes: 0,
  };
}

function containsPath(parent: string, candidate: string) {
  const pathFromParent = relative(resolve(parent), resolve(candidate));
  return (
    pathFromParent === '' ||
    (!pathFromParent.startsWith('..') && !pathFromParent.startsWith(sep))
  );
}

function scanErrorCode(error: unknown) {
  if (
    error instanceof PublicLibraryScanFailure ||
    error instanceof PublicLibraryFileCandidateError
  ) {
    return error.code;
  }
  if (error instanceof PublicLibraryDuplicateMetadataError) {
    return error.code;
  }
  if (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string'
  ) {
    return `SOURCE_${error.code}`;
  }
  return 'PUBLIC_LIBRARY_SCAN_ITEM_FAILED';
}

function sameFileStat(
  left: Awaited<ReturnType<Awaited<ReturnType<typeof open>>['stat']>>,
  right: Awaited<ReturnType<Awaited<ReturnType<typeof open>>['stat']>>,
) {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.nlink === right.nlink &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs &&
    left.ctimeMs === right.ctimeMs
  );
}

@Injectable()
export class PublicLibraryScanner {
  private readonly completions = new Map<
    string,
    {
      leaseOwner: string;
      promise: Promise<PublicLibraryScanJob | undefined>;
    }
  >();

  constructor(
    private readonly roots: PublicLibraryMaintenanceRootRegistry,
    private readonly scans: PublicLibraryScanRepository,
    private readonly publisher: PublicLibraryRepository,
    private readonly limits: PublicLibraryScanLimits = defaultLimits,
    private readonly keepAliveIntervalMs = 10_000,
  ) {}

  listRoots() {
    return this.roots.list();
  }

  getLimits() {
    return { ...this.limits };
  }

  async getJob(scanId: string, page = 1, pageSize = 50) {
    return this.scans.get(scanId, page, pageSize);
  }

  async start(rootId: string) {
    const root = await this.roots.getForScan(rootId);
    if (!root) throw new PublicLibraryScanFailure('SCAN_ROOT_NOT_FOUND');
    await this.assertRootUnchanged(root);
    const lease = await this.scans.begin(
      root.rootId,
      root.label,
      root.configFingerprint,
    );
    const completion = this.run(root, lease.job.scanId, lease.leaseOwner)
      .catch(async (error: unknown) => {
        if (error instanceof PublicLibraryScanLeaseLostError) {
          return this.scans.get(lease.job.scanId);
        }
        throw error;
      })
      .finally(() => {
        if (
          this.completions.get(lease.job.scanId)?.leaseOwner ===
          lease.leaseOwner
        ) {
          this.completions.delete(lease.job.scanId);
        }
      });
    this.completions.set(lease.job.scanId, {
      leaseOwner: lease.leaseOwner,
      promise: completion,
    });
    void completion.catch(() => undefined);
    return lease.job;
  }

  async waitForCompletion(scanId: string) {
    const completion = this.completions.get(scanId);
    return completion ? completion.promise : this.scans.get(scanId);
  }

  private async assertRootUnchanged(root: PublicLibraryMaintenanceRoot) {
    const status = await lstat(root.absolutePath);
    const currentRealPath = await realpath(root.absolutePath);
    const currentFingerprint = createHash('sha256')
      .update(
        `${root.rootId}\0${currentRealPath}\0${status.dev}\0${status.ino}`,
      )
      .digest('hex');
    if (
      !status.isDirectory() ||
      status.isSymbolicLink() ||
      currentRealPath !== root.realPath ||
      currentFingerprint !== root.configFingerprint
    ) {
      throw new PublicLibraryScanFailure('SCAN_ROOT_CHANGED');
    }
  }

  private async discover(
    root: PublicLibraryMaintenanceRoot,
    keepAlive: () => Promise<void>,
  ) {
    const inventory: Inventory = {
      files: [],
      directories: [],
      skipped: [],
      totalBytes: 0,
    };
    const normalizedPaths = new Set<string>();
    const walk = async (directory: string, depth: number): Promise<void> => {
      const directoryStat = await lstat(directory);
      if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
        throw new PublicLibraryScanFailure('SCAN_DIRECTORY_CHANGED');
      }
      inventory.directories.push({
        absolutePath: directory,
        dev: directoryStat.dev,
        ino: directoryStat.ino,
        mtimeMs: directoryStat.mtimeMs,
        ctimeMs: directoryStat.ctimeMs,
      });
      const handle = await opendir(directory);
      const entries = [];
      for await (const entry of handle) entries.push(entry);
      entries.sort((left, right) => left.name.localeCompare(right.name));
      for (const entry of entries) {
        await keepAlive();
        const absolutePath = resolve(directory, entry.name);
        const sourceStat = await lstat(absolutePath);
        const pathFromRoot = relative(root.absolutePath, absolutePath)
          .split(sep)
          .join('/');
        if (sourceStat.isSymbolicLink()) {
          const safePath = normalizePublicLibraryRelativePath(
            pathFromRoot,
            this.limits.maxDepth,
          );
          if (safePath) inventory.skipped.push(safePath);
          continue;
        }
        if (sourceStat.isDirectory()) {
          if (depth >= this.limits.maxDepth) {
            throw new PublicLibraryScanFailure('SCAN_DEPTH_LIMIT_EXCEEDED');
          }
          await walk(absolutePath, depth + 1);
          continue;
        }
        if (!pathFromRoot.toLocaleLowerCase('en-US').endsWith('.txt')) {
          continue;
        }
        const relativePath = normalizePublicLibraryRelativePath(
          pathFromRoot,
          this.limits.maxDepth,
        );
        if (!relativePath || !sourceStat.isFile()) {
          if (relativePath) inventory.skipped.push(relativePath);
          continue;
        }
        const normalizedKey = relativePath.toLocaleLowerCase('en-US');
        if (normalizedPaths.has(normalizedKey)) {
          throw new PublicLibraryScanFailure('SCAN_PATH_COLLISION');
        }
        normalizedPaths.add(normalizedKey);
        if (sourceStat.size > this.limits.maxFileBytes) {
          throw new PublicLibraryScanFailure('SCAN_FILE_LIMIT_EXCEEDED');
        }
        if (sourceStat.nlink > 1) {
          throw new PublicLibraryScanFailure('SOURCE_HARDLINK_FORBIDDEN');
        }
        inventory.files.push({
          absolutePath,
          relativePath,
          dev: sourceStat.dev,
          ino: sourceStat.ino,
          nlink: sourceStat.nlink,
          size: sourceStat.size,
          mtimeMs: sourceStat.mtimeMs,
          ctimeMs: sourceStat.ctimeMs,
        });
        inventory.totalBytes += sourceStat.size;
        if (inventory.files.length > this.limits.maxFiles) {
          throw new PublicLibraryScanFailure('SCAN_FILE_COUNT_LIMIT_EXCEEDED');
        }
        if (inventory.totalBytes > this.limits.maxTotalBytes) {
          throw new PublicLibraryScanFailure('SCAN_TOTAL_BYTES_LIMIT_EXCEEDED');
        }
      }
    };
    await walk(root.absolutePath, 0);
    inventory.files.sort((left, right) =>
      left.relativePath.localeCompare(right.relativePath),
    );
    inventory.skipped.sort((left, right) => left.localeCompare(right));
    return inventory;
  }

  private async readStable(
    root: PublicLibraryMaintenanceRoot,
    file: InventoryFile,
    keepAlive: () => Promise<void>,
  ) {
    const beforeRealPath = await realpath(file.absolutePath);
    if (!containsPath(root.realPath, beforeRealPath)) {
      throw new PublicLibraryScanFailure('SOURCE_OUTSIDE_ROOT');
    }
    const handle = await open(
      file.absolutePath,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    try {
      const before = await handle.stat();
      if (
        !before.isFile() ||
        before.nlink > 1 ||
        before.size > this.limits.maxFileBytes
      ) {
        throw new PublicLibraryScanFailure('SOURCE_NOT_REGULAR_FILE');
      }
      if (
        before.dev !== file.dev ||
        before.ino !== file.ino ||
        before.nlink !== file.nlink ||
        before.size !== file.size ||
        before.mtimeMs !== file.mtimeMs ||
        before.ctimeMs !== file.ctimeMs
      ) {
        throw new PublicLibraryScanFailure('SOURCE_CHANGED');
      }
      const chunks: Buffer[] = [];
      let bytesReadTotal = 0;
      while (true) {
        const chunk = Buffer.allocUnsafe(
          Math.min(64 * 1024, this.limits.maxFileBytes + 1 - bytesReadTotal),
        );
        const { bytesRead } = await handle.read(chunk, 0, chunk.length, null);
        if (bytesRead === 0) break;
        bytesReadTotal += bytesRead;
        if (bytesReadTotal > this.limits.maxFileBytes) {
          throw new PublicLibraryScanFailure('SCAN_FILE_LIMIT_EXCEEDED');
        }
        chunks.push(chunk.subarray(0, bytesRead));
        await keepAlive();
      }
      const bytes = Buffer.concat(chunks, bytesReadTotal);
      const after = await handle.stat();
      const afterRealPath = await realpath(file.absolutePath);
      if (
        !sameFileStat(before, after) ||
        bytes.length !== before.size ||
        beforeRealPath !== afterRealPath ||
        !containsPath(root.realPath, afterRealPath)
      ) {
        throw new PublicLibraryScanFailure('SOURCE_CHANGED');
      }
      return bytes;
    } finally {
      await handle.close();
    }
  }

  private async assertDirectoryManifest(
    inventory: Inventory,
    keepAlive: () => Promise<void>,
  ) {
    for (const directory of inventory.directories) {
      await keepAlive();
      const current = await lstat(directory.absolutePath);
      if (
        !current.isDirectory() ||
        current.isSymbolicLink() ||
        current.dev !== directory.dev ||
        current.ino !== directory.ino ||
        current.mtimeMs !== directory.mtimeMs ||
        current.ctimeMs !== directory.ctimeMs
      ) {
        throw new PublicLibraryScanFailure('SCAN_DIRECTORY_CHANGED');
      }
    }
  }

  private async record(
    scanId: string,
    leaseOwner: string,
    progress: PublicLibraryScanProgress,
    item: PublicLibraryScanItem,
  ) {
    progress.processedCount += 1;
    progress[`${item.outcome}Count` as keyof PublicLibraryScanProgress] += 1;
    await this.scans.heartbeat(scanId, leaseOwner, progress, item);
  }

  private async run(
    root: PublicLibraryMaintenanceRoot,
    scanId: string,
    leaseOwner: string,
  ) {
    const progress = emptyProgress();
    let lastKeepAliveAt = 0;
    const keepAlive = async (force = false) => {
      const now = Date.now();
      if (
        !force &&
        now - lastKeepAliveAt < Math.max(0, this.keepAliveIntervalMs)
      ) {
        return;
      }
      lastKeepAliveAt = now;
      await this.scans.heartbeat(scanId, leaseOwner, progress);
    };
    try {
      await this.assertRootUnchanged(root);
      await keepAlive(true);
      const inventory = await this.discover(root, keepAlive);
      progress.discoveredCount =
        inventory.files.length + inventory.skipped.length;
      progress.totalBytes = inventory.totalBytes;
      await keepAlive(true);
      for (const relativePath of inventory.skipped) {
        await this.record(scanId, leaseOwner, progress, {
          relativePath,
          outcome: 'skipped',
          errorCode: 'SOURCE_NOT_REGULAR_FILE',
        });
      }
      for (const file of inventory.files) {
        await keepAlive(true);
        let item: PublicLibraryScanItem;
        try {
          const bytes = await this.readStable(root, file, keepAlive);
          const sourceHash = createHash('sha256').update(bytes).digest('hex');
          const candidate = buildPublicLibraryFileCandidate({
            kind: 'maintenance_scan',
            scope: root.rootId,
            relativePath: file.relativePath,
            bytes,
            category: '其他',
            publicationFence: { scanId, leaseOwner },
          });
          const publication =
            await this.publisher.publishCandidateWithOutcome(candidate);
          item = {
            relativePath: file.relativePath,
            sourceHash,
            bookId: publication.book.id,
            outcome: publication.outcome,
          };
        } catch (error) {
          item = {
            relativePath: file.relativePath,
            outcome:
              error instanceof PublicLibraryDuplicateMetadataError
                ? 'duplicate'
                : 'failed',
            errorCode: scanErrorCode(error),
          };
        }
        await this.record(scanId, leaseOwner, progress, item);
      }
      await this.assertDirectoryManifest(inventory, keepAlive);
      const status =
        progress.failedCount > 0 || progress.duplicateCount > 0
          ? 'completed_with_errors'
          : 'completed';
      return this.scans.finish(scanId, leaseOwner, status, progress);
    } catch (error) {
      return this.scans.finish(
        scanId,
        leaseOwner,
        'failed',
        progress,
        scanErrorCode(error),
      );
    }
  }
}
