import { createClient, type Client } from '@libsql/client';
import { LocalFileBlobStorage } from '@reader/storage-core/node';
import { createHash } from 'node:crypto';
import {
  lstat,
  link,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PublicLibraryMaintenanceRoot } from './public-library-maintenance-roots';
import { PublicLibraryMaintenanceRootRegistry } from './public-library-maintenance-root-registry';
import { buildPublicLibraryFileCandidate } from './public-library-file-candidate';
import {
  preparePublicLibraryDatabase,
  PublicLibraryRepository,
} from './public-library.repository';
import { PublicLibraryScanRepository } from './public-library-scan.repository';
import {
  PublicLibraryScanner,
  resolvePublicLibraryScanLimits,
} from './public-library-scanner';

describe('PublicLibraryScanner', () => {
  let root: string;
  let sourceRoot: string;
  let client: Client;
  let publisher: PublicLibraryRepository;
  let scans: PublicLibraryScanRepository;
  let maintenanceRoot: PublicLibraryMaintenanceRoot;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'public-library-scanner-'));
    sourceRoot = join(root, 'source');
    await mkdir(join(sourceRoot, '古籍', '经部'), { recursive: true });
    await writeFile(
      join(sourceRoot, '古籍', '经部', '甲.txt'),
      '第一章\n正文甲',
    );
    await writeFile(join(sourceRoot, '乙.txt'), '第一章\n正文乙');
    await writeFile(join(root, 'outside-secret.txt'), '不应读取的外部正文');
    await symlink(
      join(root, 'outside-secret.txt'),
      join(sourceRoot, '外部链接.txt'),
    );
    client = createClient({ url: `file:${join(root, 'catalog.sqlite')}` });
    await preparePublicLibraryDatabase(client);
    publisher = new PublicLibraryRepository(
      client,
      new LocalFileBlobStorage(join(root, 'objects')),
    );
    scans = new PublicLibraryScanRepository(client);
    const sourceStat = await lstat(sourceRoot);
    const sourceRealPath = await realpath(sourceRoot);
    maintenanceRoot = {
      rootId: 'fixture',
      label: '隔离目录',
      absolutePath: sourceRoot,
      realPath: sourceRealPath,
      configFingerprint: createHash('sha256')
        .update(
          `fixture\0${sourceRealPath}\0${sourceStat.dev}\0${sourceStat.ino}`,
        )
        .digest('hex'),
    };
  });

  afterEach(async () => {
    client.close();
    await rm(root, { recursive: true, force: true });
  });

  it('publishes stable regular TXT files, skips symlinks, and replays receipts', async () => {
    const sourceFile = join(sourceRoot, '古籍', '经部', '甲.txt');
    const beforeBytes = await readFile(sourceFile);
    const beforeStat = await lstat(sourceFile);
    const scanner = new PublicLibraryScanner(
      new PublicLibraryMaintenanceRootRegistry([maintenanceRoot]),
      scans,
      publisher,
    );

    const first = await scanner.start('fixture');
    await expect(
      scanner.waitForCompletion(first.scanId),
    ).resolves.toMatchObject({
      status: 'completed',
      discoveredCount: 3,
      processedCount: 3,
      createdCount: 2,
      unchangedCount: 0,
      skippedCount: 1,
    });
    const second = await scanner.start('fixture');
    await expect(
      scanner.waitForCompletion(second.scanId),
    ).resolves.toMatchObject({
      status: 'completed',
      createdCount: 0,
      unchangedCount: 2,
      skippedCount: 1,
    });
    await expect(
      client.execute('SELECT COUNT(*) AS total FROM public_books'),
    ).resolves.toMatchObject({ rows: [{ total: 2 }] });
    await expect(
      client.execute(
        `SELECT source_scope, relative_path FROM public_sources
         ORDER BY relative_path`,
      ),
    ).resolves.toMatchObject({
      rows: [
        { source_scope: 'fixture', relative_path: '乙.txt' },
        { source_scope: 'fixture', relative_path: '古籍/经部/甲.txt' },
      ],
    });
    expect(await readFile(sourceFile)).toEqual(beforeBytes);
    const afterStat = await lstat(sourceFile);
    expect({ mode: afterStat.mode, mtimeMs: afterStat.mtimeMs }).toEqual({
      mode: beforeStat.mode,
      mtimeMs: beforeStat.mtimeMs,
    });

    const sourceStates = await client.execute(
      `SELECT relative_path, book_id, status FROM public_scan_source_state
       ORDER BY relative_path`,
    );
    expect(sourceStates.rows).toMatchObject([
      { relative_path: '乙.txt', status: 'active' },
      { relative_path: '古籍/经部/甲.txt', status: 'active' },
    ]);
    const removedBookId = sourceStates.rows[0]?.book_id;
    expect(typeof removedBookId).toBe('string');
    if (typeof removedBookId !== 'string') {
      throw new Error('SCAN_SOURCE_BOOK_ID_MISSING');
    }
    await rm(join(sourceRoot, '乙.txt'));

    const failingScanner = new PublicLibraryScanner(
      new PublicLibraryMaintenanceRootRegistry([maintenanceRoot]),
      scans,
      publisher,
      {
        maxDepth: 32,
        maxFiles: 5_000,
        maxFileBytes: 20 * 1024 * 1024,
        maxTotalBytes: 1,
      },
    );
    const failed = await failingScanner.start('fixture');
    await expect(
      failingScanner.waitForCompletion(failed.scanId),
    ).resolves.toMatchObject({ status: 'failed' });
    await expect(
      client.execute({
        sql: `SELECT status FROM public_scan_source_state
          WHERE root_id = 'fixture' AND relative_path = '乙.txt'`,
        args: [],
      }),
    ).resolves.toMatchObject({ rows: [{ status: 'active' }] });

    const third = await scanner.start('fixture');
    await expect(
      scanner.waitForCompletion(third.scanId),
    ).resolves.toMatchObject({
      status: 'completed',
      unchangedCount: 1,
    });
    await expect(
      client.execute({
        sql: `SELECT status FROM public_scan_source_state
          WHERE root_id = 'fixture' AND relative_path = '乙.txt'`,
        args: [],
      }),
    ).resolves.toMatchObject({ rows: [{ status: 'missing' }] });
    await expect(publisher.getPackage(removedBookId)).resolves.toMatchObject({
      chapters: [{ content: '正文乙' }],
    });
  });

  it('fails preflight before the first publication when a hard limit is exceeded', async () => {
    const heartbeat = jest.spyOn(scans, 'heartbeat');
    const scanner = new PublicLibraryScanner(
      new PublicLibraryMaintenanceRootRegistry([maintenanceRoot]),
      scans,
      publisher,
      {
        maxDepth: 32,
        maxFiles: 1,
        maxFileBytes: 20_000_000,
        maxTotalBytes: 2_000_000_000,
      },
      0,
    );
    const started = await scanner.start('fixture');
    await expect(
      scanner.waitForCompletion(started.scanId),
    ).resolves.toMatchObject({
      status: 'failed',
      errorCode: 'SCAN_FILE_COUNT_LIMIT_EXCEEDED',
      processedCount: 0,
    });
    await expect(
      client.execute('SELECT COUNT(*) AS total FROM public_books'),
    ).resolves.toMatchObject({ rows: [{ total: 0 }] });
    await expect(
      client.execute('SELECT COUNT(*) AS total FROM public_sources'),
    ).resolves.toMatchObject({ rows: [{ total: 0 }] });
    expect(
      heartbeat.mock.calls.filter((call) => call[2].discoveredCount === 0)
        .length,
    ).toBeGreaterThan(1);
  });

  it('fails the whole preflight before reading a hardlinked private file', async () => {
    const privateSentinel = join(root, 'personal.sqlite');
    await writeFile(privateSentinel, 'private-database-sentinel');
    await link(privateSentinel, join(sourceRoot, '私有正文.txt'));
    const scanner = new PublicLibraryScanner(
      new PublicLibraryMaintenanceRootRegistry([maintenanceRoot]),
      scans,
      publisher,
    );
    const started = await scanner.start('fixture');
    await expect(
      scanner.waitForCompletion(started.scanId),
    ).resolves.toMatchObject({
      status: 'failed',
      errorCode: 'SOURCE_HARDLINK_FORBIDDEN',
      processedCount: 0,
    });
    await expect(
      client.execute('SELECT COUNT(*) AS total FROM public_books'),
    ).resolves.toMatchObject({ rows: [{ total: 0 }] });
    await expect(readFile(privateSentinel)).resolves.toEqual(
      Buffer.from('private-database-sentinel'),
    );
  });

  it('reclaims the same generation and replays a publication missing its item heartbeat', async () => {
    // 以当前系统时间为基准推进，避免过去固定时间使发布围栏（lease_expires_at > now）
    // 与 SQLite 真实时钟比较恒为假而误判 fence 失效。
    let fakeNow = new Date();
    let identity = 0;
    const recoveryScans = new PublicLibraryScanRepository(
      client,
      () => new Date(fakeNow),
      () => `recovery-${(identity += 1)}`,
      1_000,
    );
    const first = await recoveryScans.begin(
      maintenanceRoot.rootId,
      maintenanceRoot.label,
      maintenanceRoot.configFingerprint,
    );
    const sourceBytes = await readFile(join(sourceRoot, '乙.txt'));
    const firstPublication = await publisher.publishCandidateWithOutcome(
      buildPublicLibraryFileCandidate({
        kind: 'maintenance_scan',
        scope: maintenanceRoot.rootId,
        relativePath: '乙.txt',
        bytes: sourceBytes,
        category: '其他',
        publicationFence: {
          scanId: first.job.scanId,
          leaseOwner: first.leaseOwner,
        },
      }),
    );
    expect(firstPublication.outcome).toBe('created');

    fakeNow = new Date(fakeNow.getTime() + 1_001);
    const scanner = new PublicLibraryScanner(
      new PublicLibraryMaintenanceRootRegistry([maintenanceRoot]),
      recoveryScans,
      publisher,
      undefined,
      0,
    );
    const resumed = await scanner.start('fixture');
    expect(resumed.scanId).toBe(first.job.scanId);
    expect(resumed.generation).toBe(first.job.generation);
    await expect(
      scanner.waitForCompletion(resumed.scanId),
    ).resolves.toMatchObject({
      status: 'completed',
      createdCount: 1,
      unchangedCount: 1,
    });
    await expect(
      client.execute(
        `SELECT relative_path, status FROM public_scan_source_state
         WHERE root_id = 'fixture' ORDER BY relative_path`,
      ),
    ).resolves.toMatchObject({
      rows: [
        { relative_path: '乙.txt', status: 'active' },
        { relative_path: '古籍/经部/甲.txt', status: 'active' },
      ],
    });
  });

  it('only lets deployment configuration tighten scanner limits', () => {
    expect(
      resolvePublicLibraryScanLimits({
        READER_PUBLIC_LIBRARY_SCAN_MAX_DEPTH: '8',
        READER_PUBLIC_LIBRARY_SCAN_MAX_FILES: '200',
        READER_PUBLIC_LIBRARY_SCAN_MAX_FILE_BYTES: '1048576',
        READER_PUBLIC_LIBRARY_SCAN_MAX_TOTAL_BYTES: '10485760',
      }),
    ).toEqual({
      maxDepth: 8,
      maxFiles: 200,
      maxFileBytes: 1_048_576,
      maxTotalBytes: 10_485_760,
    });
    expect(
      resolvePublicLibraryScanLimits({
        READER_PUBLIC_LIBRARY_SCAN_MAX_DEPTH: '64',
        READER_PUBLIC_LIBRARY_SCAN_MAX_FILES: 'invalid',
      }),
    ).toMatchObject({ maxDepth: 32, maxFiles: 5_000 });
  });

  it('rejects both new and existing edition writes from an expired scan fence', async () => {
    const existing = await publisher.publishTxt({
      title: '既有正文',
      category: '其他',
      content: '第一章\n既有正文',
      rightsConfirmed: true,
    });
    const lease = await scans.begin(
      'fixture',
      '隔离目录',
      maintenanceRoot.configFingerprint,
    );
    await client.execute({
      sql: `UPDATE public_scan_generations
        SET lease_expires_at = '2000-01-01T00:00:00.000Z'
        WHERE scan_id = ?`,
      args: [lease.job.scanId],
    });
    const source = {
      kind: 'maintenance_scan' as const,
      scope: 'fixture',
      relativePath: '既有正文.txt',
      bytes: Buffer.from('第一章\n既有正文'),
    };
    await expect(
      publisher.publishCandidateWithOutcome({
        title: '既有正文',
        category: '其他',
        source,
        chapters: [{ index: 0, title: '第一章', content: '既有正文' }],
        wordCount: 4,
        publicationFence: {
          scanId: lease.job.scanId,
          leaseOwner: lease.leaseOwner,
        },
      }),
    ).rejects.toThrow('PUBLIC_LIBRARY_SCAN_FENCE_INVALID');
    await expect(
      publisher.publishCandidateWithOutcome({
        title: '全新正文',
        category: '其他',
        source: {
          ...source,
          relativePath: '全新正文.txt',
          bytes: Buffer.from('第一章\n全新正文'),
        },
        chapters: [{ index: 0, title: '第一章', content: '全新正文' }],
        wordCount: 4,
        publicationFence: {
          scanId: lease.job.scanId,
          leaseOwner: lease.leaseOwner,
        },
      }),
    ).rejects.toThrow('PUBLIC_LIBRARY_SCAN_FENCE_INVALID');
    await expect(
      client.execute('SELECT COUNT(*) AS total FROM public_books'),
    ).resolves.toMatchObject({ rows: [{ total: 1 }] });
    await expect(
      client.execute('SELECT COUNT(*) AS total FROM public_sources'),
    ).resolves.toMatchObject({ rows: [{ total: 1 }] });
    await expect(publisher.getPackage(existing.id)).resolves.toMatchObject({
      chapters: [{ content: '既有正文' }],
    });
  });
});
