import {
  BookSchema,
  BookmarkSchema,
  ReadingProgressSchema,
  createId,
  type Book,
  type Bookmark,
  type ReadingProgress,
} from "@reader/shared-types";

export const META_SHELF_BACKUP_KEY = "read_realm_meta_shelf_backup";
export const META_SHELF_RECOVERY_GAP_KEY = "read_realm_meta_shelf_recovery_gap";
export const META_SHELF_EMPTY_ACK_KEY = "read_realm_meta_shelf_empty_ack";
export const META_SHELF_NATIVE_BACKUP_ID_KEY =
  "read_realm_meta_shelf_native_backup_id";
export const MAX_BROWSER_BACKUP_BOOKS = 100;
export const MAX_BROWSER_BACKUP_BOOKMARKS = 500;

export interface MetaShelfBackup {
  backupId: string;
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
    backupId: createId(),
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

function legacyBackupIdentity(serialized: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < serialized.length; index += 1) {
    const code = serialized.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193) >>> 0;
    second = Math.imul(second ^ code, 0x85ebca6b) >>> 0;
  }
  return `legacy:${first.toString(16).padStart(8, "0")}${second
    .toString(16)
    .padStart(8, "0")}`;
}

export function getMetaShelfBackupIdentity(serialized: string): string {
  const backup = parseMetaShelfBackup(serialized);
  return `id:${backup.backupId}`;
}

export function createEmptyShelfAcknowledgement(
  storage: Pick<Storage, "getItem">,
  acknowledgedAt: string,
): string {
  const currentBackup = storage.getItem(META_SHELF_BACKUP_KEY);
  const identities = new Set<string>();
  if (currentBackup !== null) {
    identities.add(getMetaShelfBackupIdentity(currentBackup));
  }
  const nativeIdentity = storage.getItem(META_SHELF_NATIVE_BACKUP_ID_KEY);
  if (nativeIdentity) identities.add(nativeIdentity);
  return JSON.stringify({
    acknowledgedAt,
    supersededBackupIdentities: [...identities],
  });
}

export function hasAcknowledgedEmptyShelf(
  storage: Pick<Storage, "getItem">,
): boolean {
  return isMetaShelfBackupAcknowledgedEmpty(
    storage,
    storage.getItem(META_SHELF_BACKUP_KEY),
  );
}

export function isMetaShelfBackupAcknowledgedEmpty(
  storage: Pick<Storage, "getItem">,
  serializedBackup: string | null,
): boolean {
  const raw = storage.getItem(META_SHELF_EMPTY_ACK_KEY);
  if (raw === null) return false;
  try {
    const candidate = JSON.parse(raw) as Record<string, unknown>;
    if (
      typeof candidate.acknowledgedAt !== "string" ||
      Number.isNaN(Date.parse(candidate.acknowledgedAt))
    ) {
      return false;
    }
    const expectedIdentities = Array.isArray(
      candidate.supersededBackupIdentities,
    )
      ? candidate.supersededBackupIdentities.filter(
          (value): value is string => typeof value === "string",
        )
      : typeof candidate.supersededBackupIdentity === "string"
        ? [candidate.supersededBackupIdentity]
        : [];
    if (serializedBackup === null) return expectedIdentities.length === 0;
    const candidateIdentity = getMetaShelfBackupIdentity(serializedBackup);
    if (expectedIdentities.includes(candidateIdentity)) return true;
    if (candidateIdentity.startsWith("id:legacy:")) {
      const legacyBackup = parseMetaShelfBackup(serializedBackup);
      return (
        Date.parse(legacyBackup.backupTime) <=
        Date.parse(candidate.acknowledgedAt)
      );
    }
    return false;
  } catch {
    return false;
  }
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
    backupId:
      typeof candidate.backupId === "string" && candidate.backupId.length > 0
        ? candidate.backupId
        : legacyBackupIdentity(serialized),
    books,
    progress,
    bookmarks,
    backupTime: candidate.backupTime,
    isPartial,
    originalBookCount: Number(originalBookCount),
  };
}
