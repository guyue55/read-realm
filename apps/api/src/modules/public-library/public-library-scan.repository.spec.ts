import { createClient, type Client } from '@libsql/client';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { preparePublicLibraryDatabase } from './public-library.repository';
import {
  PublicLibraryScanAlreadyRunningError,
  PublicLibraryScanLeaseLostError,
  PublicLibraryScanRepository,
  type PublicLibraryScanProgress,
} from './public-library-scan.repository';

const emptyProgress: PublicLibraryScanProgress = {
  discoveredCount: 0,
  processedCount: 0,
  createdCount: 0,
  unchangedCount: 0,
  duplicateCount: 0,
  failedCount: 0,
  skippedCount: 0,
  totalBytes: 0,
};

describe('PublicLibraryScanRepository', () => {
  let client: Client;
  let root: string;
  let now: Date;
  let sequence: number;
  let repository: PublicLibraryScanRepository;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'public-library-scan-repository-'));
    client = createClient({ url: `file:${join(root, 'catalog.sqlite')}` });
    await preparePublicLibraryDatabase(client);
    now = new Date('2026-08-15T08:30:00.000Z');
    sequence = 0;
    repository = new PublicLibraryScanRepository(
      client,
      () => new Date(now),
      () => `scan-identity-${(sequence += 1)}`,
      1_000,
    );
  });

  afterEach(async () => {
    client.close();
    await rm(root, { recursive: true, force: true });
  });

  it('allows one running generation and interrupts an expired lease', async () => {
    const first = await repository.begin('classics', '古籍', 'fingerprint-a');
    await expect(
      repository.begin('classics', '古籍', 'fingerprint-a'),
    ).rejects.toBeInstanceOf(PublicLibraryScanAlreadyRunningError);

    now = new Date(now.getTime() + 1_001);
    await expect(
      repository.heartbeat(first.job.scanId, first.leaseOwner, emptyProgress, {
        relativePath: '迟到.txt',
        sourceHash: 'a'.repeat(64),
        outcome: 'created',
      }),
    ).rejects.toBeInstanceOf(PublicLibraryScanLeaseLostError);
    await expect(
      repository.finish(
        first.job.scanId,
        first.leaseOwner,
        'completed',
        emptyProgress,
      ),
    ).rejects.toBeInstanceOf(PublicLibraryScanLeaseLostError);
    await expect(
      client.execute({
        sql: 'SELECT COUNT(*) AS total FROM public_scan_items WHERE scan_id = ?',
        args: [first.job.scanId],
      }),
    ).resolves.toMatchObject({ rows: [{ total: 0 }] });
    const second = await repository.begin('classics', '古籍', 'fingerprint-a');
    expect(second.job.scanId).toBe(first.job.scanId);
    expect(second.job.generation).toBe(first.job.generation);
    expect(second.leaseOwner).not.toBe(first.leaseOwner);
    await expect(repository.get(first.job.scanId)).resolves.toMatchObject({
      status: 'running',
      errorCode: undefined,
    });
    await expect(
      repository.finish(
        first.job.scanId,
        first.leaseOwner,
        'completed',
        emptyProgress,
      ),
    ).rejects.toBeInstanceOf(PublicLibraryScanLeaseLostError);
    await expect(
      client.execute(
        `SELECT next_generation FROM public_scan_root_state
         WHERE root_id = 'classics'`,
      ),
    ).resolves.toMatchObject({ rows: [{ next_generation: 2 }] });
  });

  it('persists bounded item facts and completes only for the lease owner', async () => {
    const lease = await repository.begin('classics', '古籍', 'fingerprint-a');
    const progress = {
      ...emptyProgress,
      discoveredCount: 1,
      processedCount: 1,
      createdCount: 1,
      totalBytes: 12,
    };
    await repository.heartbeat(lease.job.scanId, lease.leaseOwner, progress, {
      relativePath: '经部/book.txt',
      sourceHash: 'a'.repeat(64),
      outcome: 'created',
    });
    await expect(
      repository.finish(
        lease.job.scanId,
        lease.leaseOwner,
        'completed',
        progress,
      ),
    ).resolves.toMatchObject({
      status: 'completed',
      createdCount: 1,
      items: [
        {
          relativePath: '经部/book.txt',
          sourceHash: 'a'.repeat(64),
          outcome: 'created',
        },
      ],
    });
  });

  it('never lets a late completed generation roll source truth backward', async () => {
    await client.batch(
      ['book-one', 'book-two'].map((bookId, index) => ({
        sql: `INSERT INTO public_books (
          id, title, format, category, chapter_count, word_count,
          content_hash, package_hash, published_at
        ) VALUES (?, ?, 'txt', '其他', 1, 1, ?, ?, ?)`,
        args: [
          bookId,
          bookId,
          `content-${index}`,
          `package-${index}`,
          now.toISOString(),
        ],
      })),
      'write',
    );
    const first = await repository.begin('classics', '古籍', 'fingerprint-a');
    const firstProgress = {
      ...emptyProgress,
      discoveredCount: 1,
      processedCount: 1,
      createdCount: 1,
    };
    await repository.heartbeat(
      first.job.scanId,
      first.leaseOwner,
      firstProgress,
      {
        relativePath: '一.txt',
        sourceHash: '1'.repeat(64),
        bookId: 'book-one',
        outcome: 'created',
      },
    );
    await repository.finish(
      first.job.scanId,
      first.leaseOwner,
      'completed',
      firstProgress,
    );

    const second = await repository.begin('classics', '古籍', 'fingerprint-a');
    const secondProgress = {
      ...emptyProgress,
      discoveredCount: 1,
      processedCount: 1,
      createdCount: 1,
    };
    await repository.heartbeat(
      second.job.scanId,
      second.leaseOwner,
      secondProgress,
      {
        relativePath: '二.txt',
        sourceHash: '2'.repeat(64),
        bookId: 'book-two',
        outcome: 'created',
      },
    );
    await repository.finish(
      second.job.scanId,
      second.leaseOwner,
      'completed',
      secondProgress,
    );

    await repository.finish(
      first.job.scanId,
      first.leaseOwner,
      'completed',
      firstProgress,
    );
    await expect(
      client.execute(
        `SELECT relative_path, status FROM public_scan_source_state
         WHERE root_id = 'classics' ORDER BY relative_path`,
      ),
    ).resolves.toMatchObject({
      rows: [
        { relative_path: '一.txt', status: 'missing' },
        { relative_path: '二.txt', status: 'active' },
      ],
    });
    await expect(
      client.execute(
        `SELECT last_completed_generation FROM public_scan_root_state
         WHERE root_id = 'classics'`,
      ),
    ).resolves.toMatchObject({ rows: [{ last_completed_generation: 2 }] });
  });

  it('refuses to bind an existing root id to a different physical fingerprint', async () => {
    const first = await repository.begin('classics', '古籍', 'fingerprint-a');
    await repository.finish(
      first.job.scanId,
      first.leaseOwner,
      'failed',
      emptyProgress,
      'EXPECTED_TEST_FAILURE',
    );
    await expect(
      repository.begin('classics', '古籍', 'fingerprint-b'),
    ).rejects.toThrow('PUBLIC_LIBRARY_SCAN_ROOT_REBOUND');
    await expect(
      client.execute(
        `SELECT next_generation, last_completed_generation
         FROM public_scan_root_state WHERE root_id = 'classics'`,
      ),
    ).resolves.toMatchObject({
      rows: [{ next_generation: 2, last_completed_generation: 0 }],
    });
  });
});
