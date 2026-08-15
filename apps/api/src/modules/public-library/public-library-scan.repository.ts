import type { Client, InStatement } from '@libsql/client';
import { randomUUID } from 'node:crypto';

export type PublicLibraryScanStatus =
  | 'running'
  | 'completed'
  | 'completed_with_errors'
  | 'failed'
  | 'interrupted';

export type PublicLibraryScanItemOutcome =
  | 'created'
  | 'unchanged'
  | 'duplicate'
  | 'failed'
  | 'skipped';

export interface PublicLibraryScanProgress {
  discoveredCount: number;
  processedCount: number;
  createdCount: number;
  unchangedCount: number;
  duplicateCount: number;
  failedCount: number;
  skippedCount: number;
  totalBytes: number;
}

export interface PublicLibraryScanItem {
  relativePath: string;
  sourceHash?: string;
  bookId?: string;
  outcome: PublicLibraryScanItemOutcome;
  errorCode?: string;
}

export interface PublicLibraryScanJob extends PublicLibraryScanProgress {
  scanId: string;
  generation: number;
  rootId: string;
  rootLabel: string;
  status: PublicLibraryScanStatus;
  heartbeatAt: string;
  errorCode?: string;
  startedAt: string;
  completedAt?: string;
  items: PublicLibraryScanItem[];
  itemPage: number;
  itemPageSize: number;
}

export interface PublicLibraryScanLease {
  job: PublicLibraryScanJob;
  leaseOwner: string;
}

export class PublicLibraryScanAlreadyRunningError extends Error {
  constructor() {
    super('PUBLIC_LIBRARY_SCAN_ALREADY_RUNNING');
    this.name = 'PublicLibraryScanAlreadyRunningError';
  }
}

export class PublicLibraryScanLeaseLostError extends Error {
  constructor() {
    super('PUBLIC_LIBRARY_SCAN_LEASE_LOST');
    this.name = 'PublicLibraryScanLeaseLostError';
  }
}

function optionalText(value: unknown) {
  return typeof value === 'string' && value ? value : undefined;
}

function rowToJob(row: Record<string, unknown>): PublicLibraryScanJob {
  return {
    scanId: String(row.scan_id),
    generation: Number(row.generation),
    rootId: String(row.root_id),
    rootLabel: String(row.root_label),
    status: String(row.status) as PublicLibraryScanStatus,
    heartbeatAt: String(row.heartbeat_at),
    discoveredCount: Number(row.discovered_count),
    processedCount: Number(row.processed_count),
    createdCount: Number(row.created_count),
    unchangedCount: Number(row.unchanged_count),
    duplicateCount: Number(row.duplicate_count),
    failedCount: Number(row.failed_count),
    skippedCount: Number(row.skipped_count),
    totalBytes: Number(row.total_bytes),
    errorCode: optionalText(row.error_code),
    startedAt: String(row.started_at),
    completedAt: optionalText(row.completed_at),
    items: [],
    itemPage: 1,
    itemPageSize: 50,
  };
}

function rowToItem(row: Record<string, unknown>): PublicLibraryScanItem {
  return {
    relativePath: String(row.relative_path),
    sourceHash: optionalText(row.source_hash),
    bookId: optionalText(row.book_id),
    outcome: String(row.outcome) as PublicLibraryScanItemOutcome,
    errorCode: optionalText(row.error_code),
  };
}

function isConstraintError(error: unknown) {
  return (
    error instanceof Error &&
    /UNIQUE constraint failed: public_scan_generations\.root_id/i.test(
      error.message,
    )
  );
}

export class PublicLibraryScanRepository {
  constructor(
    private readonly client: Client,
    private readonly now: () => Date = () => new Date(),
    private readonly idFactory: () => string = randomUUID,
    private readonly leaseMs = 5 * 60_000,
  ) {}

  private expiresAt(now: Date) {
    return new Date(now.getTime() + this.leaseMs).toISOString();
  }

  private async readItems(scanId: string, page: number, pageSize: number) {
    const result = await this.client.execute({
      sql: `SELECT relative_path, source_hash, book_id, outcome, error_code
        FROM public_scan_items WHERE scan_id = ?
        ORDER BY relative_path ASC LIMIT ? OFFSET ?`,
      args: [scanId, pageSize, (page - 1) * pageSize],
    });
    return result.rows.map((row) => rowToItem(row as Record<string, unknown>));
  }

  async get(scanId: string, page = 1, pageSize = 50) {
    const result = await this.client.execute({
      sql: 'SELECT * FROM public_scan_generations WHERE scan_id = ? LIMIT 1',
      args: [scanId],
    });
    const row = result.rows[0] as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return {
      ...rowToJob(row),
      items: await this.readItems(scanId, page, pageSize),
      itemPage: page,
      itemPageSize: pageSize,
    };
  }

  async begin(
    rootId: string,
    rootLabel: string,
    configFingerprint: string,
  ): Promise<PublicLibraryScanLease> {
    const now = this.now();
    const nowIso = now.toISOString();
    const scanId = this.idFactory();
    const leaseOwner = this.idFactory();
    try {
      const results = await this.client.batch(
        [
          {
            sql: `INSERT OR IGNORE INTO public_scan_root_state (
              root_id, config_fingerprint, next_generation,
              last_completed_generation
            ) VALUES (?, ?, 1, 0)`,
            args: [rootId, configFingerprint],
          },
          {
            sql: `UPDATE public_scan_generations
              SET status = 'interrupted', error_code = 'LEASE_EXPIRED',
                  completed_at = ?
              WHERE root_id = ? AND status = 'running'
                AND lease_expires_at <= ?`,
            args: [nowIso, rootId, nowIso],
          },
          {
            sql: `UPDATE public_scan_generations SET
                status = 'running', lease_owner = ?, lease_expires_at = ?,
                heartbeat_at = ?, completed_at = NULL, error_code = NULL,
                discovered_count = 0, processed_count = 0,
                created_count = 0, unchanged_count = 0,
                duplicate_count = 0, failed_count = 0, skipped_count = 0,
                total_bytes = 0
              WHERE scan_id = (
                SELECT g.scan_id FROM public_scan_generations g
                JOIN public_scan_root_state r ON r.root_id = g.root_id
                WHERE g.root_id = ? AND g.config_fingerprint = ?
                  AND g.status = 'interrupted'
                  AND g.error_code = 'LEASE_EXPIRED'
                  AND g.generation = r.next_generation - 1
                ORDER BY g.generation DESC LIMIT 1
              ) AND NOT EXISTS (
                SELECT 1 FROM public_scan_generations active
                WHERE active.root_id = ? AND active.status = 'running'
              )`,
            args: [
              leaseOwner,
              this.expiresAt(now),
              nowIso,
              rootId,
              configFingerprint,
              rootId,
            ],
          },
          {
            sql: `INSERT INTO public_scan_generations (
              scan_id, root_id, root_label, generation, config_fingerprint,
              status, lease_owner,
              lease_expires_at, heartbeat_at, started_at
            ) SELECT ?, ?, ?, next_generation, ?, 'running', ?, ?, ?, ?
              FROM public_scan_root_state
              WHERE root_id = ? AND config_fingerprint = ?
                AND NOT EXISTS (
                  SELECT 1 FROM public_scan_generations active
                  WHERE active.root_id = ? AND active.status = 'running'
                )`,
            args: [
              scanId,
              rootId,
              rootLabel,
              configFingerprint,
              leaseOwner,
              this.expiresAt(now),
              nowIso,
              nowIso,
              rootId,
              configFingerprint,
              rootId,
            ],
          },
          {
            sql: `UPDATE public_scan_root_state
              SET next_generation = next_generation + 1
              WHERE root_id = ? AND config_fingerprint = ?
                AND EXISTS (
                  SELECT 1 FROM public_scan_generations WHERE scan_id = ?
                )`,
            args: [rootId, configFingerprint, scanId],
          },
          {
            sql: `DELETE FROM public_scan_items WHERE scan_id = (
              SELECT scan_id FROM public_scan_generations
              WHERE root_id = ? AND lease_owner = ? AND status = 'running'
              LIMIT 1
            )`,
            args: [rootId, leaseOwner],
          },
          {
            sql: `SELECT *, CASE WHEN lease_owner = ? THEN 1 ELSE 0 END AS acquired
              FROM public_scan_generations
              WHERE root_id = ? AND status = 'running' LIMIT 1`,
            args: [leaseOwner, rootId],
          },
        ],
        'write',
      );
      const row = results.at(-1)?.rows[0] as
        | Record<string, unknown>
        | undefined;
      if (row && Number(row.acquired) !== 1) {
        throw new PublicLibraryScanAlreadyRunningError();
      }
      if (!row) throw new Error('PUBLIC_LIBRARY_SCAN_ROOT_REBOUND');
      return { job: rowToJob(row), leaseOwner };
    } catch (error) {
      if (isConstraintError(error)) {
        throw new PublicLibraryScanAlreadyRunningError();
      }
      throw error;
    }
  }

  private progressArgs(progress: PublicLibraryScanProgress) {
    return [
      progress.discoveredCount,
      progress.processedCount,
      progress.createdCount,
      progress.unchangedCount,
      progress.duplicateCount,
      progress.failedCount,
      progress.skippedCount,
      progress.totalBytes,
    ];
  }

  async heartbeat(
    scanId: string,
    leaseOwner: string,
    progress: PublicLibraryScanProgress,
    item?: PublicLibraryScanItem,
  ) {
    const now = this.now();
    const statements: InStatement[] = [];
    if (item) {
      statements.push({
        sql: `INSERT INTO public_scan_items (
          scan_id, relative_path, source_hash, book_id, outcome, error_code
        ) SELECT scan_id, ?, ?, ?, ?, ? FROM public_scan_generations
          WHERE scan_id = ? AND lease_owner = ? AND status = 'running'
            AND lease_expires_at > ?
        ON CONFLICT(scan_id, relative_path) DO UPDATE SET
          source_hash = excluded.source_hash,
          book_id = excluded.book_id,
          outcome = excluded.outcome,
          error_code = excluded.error_code`,
        args: [
          item.relativePath,
          item.sourceHash ?? null,
          item.bookId ?? null,
          item.outcome,
          item.errorCode ?? null,
          scanId,
          leaseOwner,
          now.toISOString(),
        ],
      });
    }
    statements.push(
      {
        sql: `UPDATE public_scan_generations SET
          discovered_count = ?, processed_count = ?, created_count = ?,
          unchanged_count = ?, duplicate_count = ?, failed_count = ?,
          skipped_count = ?, total_bytes = ?, heartbeat_at = ?,
          lease_expires_at = ?
          WHERE scan_id = ? AND lease_owner = ? AND status = 'running'
            AND lease_expires_at > ?`,
        args: [
          ...this.progressArgs(progress),
          now.toISOString(),
          this.expiresAt(now),
          scanId,
          leaseOwner,
          now.toISOString(),
        ],
      },
      {
        sql: `SELECT * FROM public_scan_generations
          WHERE scan_id = ? AND lease_owner = ? AND status = 'running'
            AND lease_expires_at > ? LIMIT 1`,
        args: [scanId, leaseOwner, now.toISOString()],
      },
    );
    const results = await this.client.batch(statements, 'write');
    const row = results.at(-1)?.rows[0] as Record<string, unknown> | undefined;
    if (!row) throw new PublicLibraryScanLeaseLostError();
    return rowToJob(row);
  }

  async finish(
    scanId: string,
    leaseOwner: string,
    status: 'completed' | 'completed_with_errors' | 'failed',
    progress: PublicLibraryScanProgress,
    errorCode?: string,
  ) {
    const nowIso = this.now().toISOString();
    const statements: InStatement[] = [
      {
        sql: `UPDATE public_scan_generations SET
          status = ?, discovered_count = ?, processed_count = ?,
          created_count = ?, unchanged_count = ?, duplicate_count = ?,
          failed_count = ?, skipped_count = ?, total_bytes = ?,
          error_code = ?, heartbeat_at = ?, completed_at = ?
          WHERE scan_id = ? AND lease_owner = ? AND status = 'running'
            AND lease_expires_at > ?`,
        args: [
          status,
          ...this.progressArgs(progress),
          errorCode ?? null,
          nowIso,
          nowIso,
          scanId,
          leaseOwner,
          nowIso,
        ],
      },
    ];
    if (status === 'completed') {
      statements.push(
        {
          sql: `INSERT INTO public_scan_source_state (
            root_id, relative_path, source_hash, book_id, status,
            first_seen_generation, last_seen_generation
          ) SELECT g.root_id, i.relative_path, i.source_hash, i.book_id,
              'active', g.generation, g.generation
            FROM public_scan_generations g
            JOIN public_scan_items i ON i.scan_id = g.scan_id
            JOIN public_scan_root_state r ON r.root_id = g.root_id
            WHERE g.scan_id = ? AND g.lease_owner = ?
              AND g.status = 'completed'
              AND g.generation > r.last_completed_generation
              AND i.outcome IN ('created', 'unchanged')
              AND i.source_hash IS NOT NULL AND i.book_id IS NOT NULL
            ON CONFLICT(root_id, relative_path, source_hash) DO UPDATE SET
              book_id = excluded.book_id, status = 'active',
              last_seen_generation = excluded.last_seen_generation`,
          args: [scanId, leaseOwner],
        },
        {
          sql: `UPDATE public_scan_source_state SET status = 'missing'
            WHERE root_id = (
              SELECT g.root_id FROM public_scan_generations g
              JOIN public_scan_root_state r ON r.root_id = g.root_id
              WHERE g.scan_id = ? AND g.lease_owner = ?
                AND g.status = 'completed'
                AND g.generation > r.last_completed_generation
            ) AND status = 'active' AND NOT EXISTS (
              SELECT 1 FROM public_scan_items i
              WHERE i.scan_id = ?
                AND i.relative_path = public_scan_source_state.relative_path
                AND i.source_hash = public_scan_source_state.source_hash
                AND i.outcome IN ('created', 'unchanged')
            )`,
          args: [scanId, leaseOwner, scanId],
        },
        {
          sql: `UPDATE public_scan_root_state
            SET last_completed_generation = (
              SELECT generation FROM public_scan_generations
              WHERE scan_id = ? AND lease_owner = ? AND status = 'completed'
            )
            WHERE root_id = (
              SELECT root_id FROM public_scan_generations
              WHERE scan_id = ? AND lease_owner = ? AND status = 'completed'
            ) AND last_completed_generation < (
              SELECT generation FROM public_scan_generations
              WHERE scan_id = ? AND lease_owner = ? AND status = 'completed'
            )`,
          args: [scanId, leaseOwner, scanId, leaseOwner, scanId, leaseOwner],
        },
      );
    }
    statements.push({
      sql: `SELECT * FROM public_scan_generations
        WHERE scan_id = ? AND lease_owner = ? AND status = ? LIMIT 1`,
      args: [scanId, leaseOwner, status],
    });
    const results = await this.client.batch(statements, 'write');
    const row = results.at(-1)?.rows[0] as Record<string, unknown> | undefined;
    if (!row) throw new PublicLibraryScanLeaseLostError();
    return {
      ...rowToJob(row),
      items: await this.readItems(scanId, 1, 50),
      itemPage: 1,
      itemPageSize: 50,
    };
  }
}
