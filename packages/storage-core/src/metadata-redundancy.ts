import {
  BookSchema,
  BookmarkSchema,
  ReadingProgressSchema,
  type Book,
  type Bookmark,
  type ReadingProgress,
} from "@reader/shared-types";

export const META_SHELF_BACKUP_KEY = "read_realm_meta_shelf_backup";
export const META_SHELF_RECOVERY_GAP_KEY = "read_realm_meta_shelf_recovery_gap";
export const MAX_BROWSER_BACKUP_BOOKS = 100;
export const MAX_BROWSER_BACKUP_BOOKMARKS = 500;

export interface MetaShelfBackup {
  books: Book[];
  progress: ReadingProgress[];
  bookmarks: Bookmark[];
  backupTime: string;
  isPartial: boolean;
  originalBookCount: number;
}

export type MetadataBackupCompleteness = {
  status: "complete" | "partial";
  storedBookCount: number;
  expectedBookCount: number;
};

export type MetadataBackupWriteResult =
  | MetadataBackupCompleteness
  | {
      status: "skipped_stale";
      storedBookCount: number;
      expectedBookCount: number;
    }
  | {
      status: "failed";
      storedBookCount: 0;
      expectedBookCount: number;
    };

export type MetadataBackupResult =
  | MetadataBackupWriteResult
  | {
      status: "skipped";
      storedBookCount: 0;
      expectedBookCount: number;
    };

export type MetadataRestoreResult = {
  status:
    | "not_needed"
    | "not_found"
    | "recovery_gap"
    | "complete"
    | "partial"
    | "failed";
  restoredBookCount: number;
  expectedBookCount: number;
  source: "browser" | "capacitor" | "tauri" | null;
};

type BackupInput = {
  books: readonly Book[];
  progress: readonly ReadingProgress[];
  bookmarks: readonly Bookmark[];
  backupTime: string;
  expectedBookCount?: number;
};

type BackupStorage = Pick<Storage, "getItem" | "setItem">;

function timestamp(book: Book): number {
  const value = book.lastReadAt ?? book.updatedAt ?? book.createdAt;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function buildBrowserMetaShelfBackup({
  books: inputBooks,
  progress: inputProgress,
  bookmarks: inputBookmarks,
  backupTime,
  expectedBookCount = inputBooks.length,
}: BackupInput): MetaShelfBackup {
  const originalBookCount = Math.max(inputBooks.length, expectedBookCount);
  const isPartial =
    originalBookCount > inputBooks.length ||
    inputBooks.length > MAX_BROWSER_BACKUP_BOOKS ||
    inputBookmarks.length > MAX_BROWSER_BACKUP_BOOKMARKS;
  const books = [...inputBooks]
    .sort((left, right) => timestamp(right) - timestamp(left) || left.id.localeCompare(right.id))
    .slice(0, MAX_BROWSER_BACKUP_BOOKS);
  const allowedBookIds = new Set(books.map((book) => book.id));

  return {
    books,
    progress: inputProgress.filter((item) => allowedBookIds.has(item.bookId)),
    bookmarks: inputBookmarks
      .filter((item) => allowedBookIds.has(item.bookId))
      .slice(-MAX_BROWSER_BACKUP_BOOKMARKS),
    backupTime,
    isPartial,
    originalBookCount,
  };
}

export function readMetaShelfRecoveryGap(storage: Pick<Storage, "getItem">): number {
  const raw = storage.getItem(META_SHELF_RECOVERY_GAP_KEY);
  if (raw === null) return 0;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

export function getMetaShelfBackupCompleteness(
  backup: MetaShelfBackup,
): MetadataBackupCompleteness {
  return {
    status: backup.isPartial ? "partial" : "complete",
    storedBookCount: backup.books.length,
    expectedBookCount: backup.originalBookCount,
  };
}

export function writeBrowserMetaShelfBackup(
  storage: BackupStorage,
  backup: MetaShelfBackup,
): MetadataBackupWriteResult {
  try {
    const current = storage.getItem(META_SHELF_BACKUP_KEY);
    if (current !== null) {
      try {
        const currentBackup = parseMetaShelfBackup(current);
        const currentTime = Date.parse(currentBackup.backupTime);
        const candidateTime = Date.parse(backup.backupTime);
        if (
          !Number.isNaN(currentTime) &&
          !Number.isNaN(candidateTime) &&
          currentTime > candidateTime
        ) {
          const completeness = getMetaShelfBackupCompleteness(currentBackup);
          return {
            status: "skipped_stale",
            storedBookCount: completeness.storedBookCount,
            expectedBookCount: completeness.expectedBookCount,
          };
        }
      } catch {
        // An invalid historical value is not a usable recovery point. Replace it.
      }
    }
    storage.setItem(META_SHELF_BACKUP_KEY, JSON.stringify(backup));
    return getMetaShelfBackupCompleteness(backup);
  } catch {
    return {
      status: "failed",
      storedBookCount: 0,
      expectedBookCount: backup.originalBookCount,
    };
  }
}

export function parseMetaShelfBackup(serialized: string): MetaShelfBackup {
  const value: unknown = JSON.parse(serialized);
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("META_SHELF_BACKUP_INVALID");
  }
  const candidate = value as Record<string, unknown>;
  const books = BookSchema.array().parse(candidate.books);
  const progress = ReadingProgressSchema.array().parse(candidate.progress);
  const bookmarks = BookmarkSchema.array().parse(candidate.bookmarks);
  if (typeof candidate.backupTime !== "string" || candidate.backupTime.length === 0) {
    throw new Error("META_SHELF_BACKUP_TIME_INVALID");
  }
  const isPartial = candidate.isPartial === true;
  const originalBookCount = candidate.originalBookCount ?? books.length;
  if (
    !Number.isInteger(originalBookCount) ||
    Number(originalBookCount) < books.length ||
    (!isPartial && Number(originalBookCount) !== books.length)
  ) {
    throw new Error("META_SHELF_BACKUP_COUNT_MISMATCH");
  }
  return {
    books,
    progress,
    bookmarks,
    backupTime: candidate.backupTime,
    isPartial,
    originalBookCount: Number(originalBookCount),
  };
}
