import { describe, expect, it } from "vitest";
import type { Book, Bookmark, ReadingProgress } from "@reader/shared-types";
import {
  META_SHELF_BACKUP_KEY,
  META_SHELF_EMPTY_ACK_KEY,
  META_SHELF_RECOVERY_GAP_KEY,
  buildBrowserMetaShelfBackup,
  createEmptyShelfAcknowledgement,
  getMetaShelfBackupCompleteness,
  hasAcknowledgedEmptyShelf,
  parseMetaShelfBackup,
  readMetaShelfRecoveryGap,
  writeBrowserMetaShelfBackup,
} from "./metadata-redundancy";

function book(index: number): Book {
  const day = String((index % 28) + 1).padStart(2, "0");
  return {
    id: `book-${String(index).padStart(3, "0")}`,
    title: `Book ${index}`,
    sourceType: "upload",
    format: "epub",
    status: "reading",
    tags: [],
    chapterCount: 10,
    createdAt: `2026-01-${day}T00:00:00.000Z`,
    updatedAt: `2026-02-${day}T00:00:00.000Z`,
    lastReadAt: `2026-03-${day}T00:00:00.000Z`,
  };
}

function progress(item: Book): ReadingProgress {
  return {
    bookId: item.id,
    chapterId: `${item.id}-chapter-1`,
    chapterIndex: 0,
    offset: 0,
    percentage: 1,
    updatedAt: "2026-04-01T00:00:00.000Z",
  };
}

function bookmark(item: Book, index: number): Bookmark {
  return {
    id: `bookmark-${index}`,
    bookId: item.id,
    chapterIndex: 0,
    offset: 0,
    contentPreview: `Bookmark ${index}`,
    createdAt: "2026-04-01T00:00:00.000Z",
  };
}

describe("browser metadata redundancy", () => {
  it("marks a 500-book emergency backup as partial without mutating input", () => {
    const books = Array.from({ length: 500 }, (_, index) => book(index));
    const originalOrder = books.map((item) => item.id);
    const progressItems = books.map(progress);
    const bookmarks = books.map(bookmark);

    const backup = buildBrowserMetaShelfBackup({
      books,
      progress: progressItems,
      bookmarks,
      backupTime: "2026-08-15T00:00:00.000Z",
    });

    expect(backup.books).toHaveLength(100);
    expect(backup.progress).toHaveLength(100);
    expect(backup.bookmarks).toHaveLength(100);
    expect(backup.isPartial).toBe(true);
    expect(backup.originalBookCount).toBe(500);
    expect(getMetaShelfBackupCompleteness(backup)).toEqual({
      status: "partial",
      storedBookCount: 100,
      expectedBookCount: 500,
    });
    expect(books.map((item) => item.id)).toEqual(originalOrder);
  });

  it("preserves the last valid backup when a quota write fails", () => {
    const previous = JSON.stringify({ version: "previous" });
    const storage = {
      getItem: (key: string) => (key === META_SHELF_BACKUP_KEY ? previous : null),
      setItem: () => {
        const error = new Error("quota");
        error.name = "QuotaExceededError";
        throw error;
      },
    };
    const oneBook = book(1);
    const backup = buildBrowserMetaShelfBackup({
      books: [oneBook],
      progress: [progress(oneBook)],
      bookmarks: [bookmark(oneBook, 1)],
      backupTime: "2026-08-15T00:00:00.000Z",
    });

    expect(writeBrowserMetaShelfBackup(storage, backup)).toEqual({
      status: "failed",
      storedBookCount: 0,
      expectedBookCount: 1,
    });
    expect(storage.getItem(META_SHELF_BACKUP_KEY)).toBe(previous);
  });

  it("refuses to overwrite a newer valid backup with an older snapshot", () => {
    const newerBook = book(2);
    const newer = buildBrowserMetaShelfBackup({
      books: [newerBook],
      progress: [progress(newerBook)],
      bookmarks: [],
      backupTime: "2026-08-15T00:00:02.000Z",
    });
    const olderBook = book(1);
    const older = buildBrowserMetaShelfBackup({
      books: [olderBook],
      progress: [progress(olderBook)],
      bookmarks: [],
      backupTime: "2026-08-15T00:00:01.000Z",
    });
    let stored = JSON.stringify(newer);
    const storage = {
      getItem: () => stored,
      setItem: (_key: string, value: string) => {
        stored = value;
      },
    };

    expect(writeBrowserMetaShelfBackup(storage, older)).toEqual({
      status: "skipped_stale",
      storedBookCount: 1,
      expectedBookCount: 1,
    });
    expect(parseMetaShelfBackup(stored).books[0]?.id).toBe(newerBook.id);
  });

  it("accepts the later serialized snapshot when timestamps share a millisecond", () => {
    const firstBook = book(1);
    const secondBook = book(2);
    const backupTime = "2026-08-15T00:00:01.000Z";
    const first = buildBrowserMetaShelfBackup({
      books: [firstBook],
      progress: [],
      bookmarks: [],
      backupTime,
    });
    const second = buildBrowserMetaShelfBackup({
      books: [firstBook, secondBook],
      progress: [],
      bookmarks: [],
      backupTime,
    });
    let stored = JSON.stringify(first);
    const storage = {
      getItem: () => stored,
      setItem: (_key: string, value: string) => {
        stored = value;
      },
    };

    expect(writeBrowserMetaShelfBackup(storage, second)).toMatchObject({
      status: "complete",
      storedBookCount: 2,
    });
    expect(parseMetaShelfBackup(stored).books).toHaveLength(2);
  });

  it("keeps a recovered 100-of-500 shelf partial on later backups", () => {
    const restoredBooks = Array.from({ length: 100 }, (_, index) => book(index));

    const backup = buildBrowserMetaShelfBackup({
      books: restoredBooks,
      progress: restoredBooks.map(progress),
      bookmarks: [],
      backupTime: "2026-08-15T00:00:00.000Z",
      expectedBookCount: 500,
    });

    expect(getMetaShelfBackupCompleteness(backup)).toEqual({
      status: "partial",
      storedBookCount: 100,
      expectedBookCount: 500,
    });
    const storage = {
      getItem: (key: string) =>
        key === META_SHELF_RECOVERY_GAP_KEY ? "500" : null,
    };
    expect(readMetaShelfRecoveryGap(storage)).toBe(500);
  });

  it("does not infer a recovery gap from a normal capped emergency backup", () => {
    const books = Array.from({ length: 500 }, (_, index) => book(index));
    const backup = buildBrowserMetaShelfBackup({
      books,
      progress: [],
      bookmarks: [],
      backupTime: "2026-08-15T00:00:00.000Z",
    });
    const storage = {
      getItem: (key: string) =>
        key === META_SHELF_BACKUP_KEY ? JSON.stringify(backup) : null,
    };

    expect(readMetaShelfRecoveryGap(storage)).toBe(0);
  });

  it("acknowledges only the exact backup generation deleted by the user", () => {
    const first = buildBrowserMetaShelfBackup({
      books: [book(1)],
      progress: [],
      bookmarks: [],
      backupTime: "2026-08-15T00:00:00.000Z",
    });
    const values = new Map([[META_SHELF_BACKUP_KEY, JSON.stringify(first)]]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
    };
    values.set(
      META_SHELF_EMPTY_ACK_KEY,
      createEmptyShelfAcknowledgement(
        storage,
        "2026-08-15T00:00:01.000Z",
      ),
    );
    expect(hasAcknowledgedEmptyShelf(storage)).toBe(true);

    const next = buildBrowserMetaShelfBackup({
      books: [book(2)],
      progress: [],
      bookmarks: [],
      backupTime: "2026-08-15T00:00:00.000Z",
    });
    values.set(META_SHELF_BACKUP_KEY, JSON.stringify(next));
    expect(hasAcknowledgedEmptyShelf(storage)).toBe(false);

    values.set(META_SHELF_EMPTY_ACK_KEY, "not-json");
    expect(hasAcknowledgedEmptyShelf(storage)).toBe(false);
  });

  it("rejects a full backup whose declared count exceeds its payload", () => {
    const item = book(1);
    const serialized = JSON.stringify({
      books: [item],
      progress: [progress(item)],
      bookmarks: [],
      backupTime: "2026-08-15T00:00:00.000Z",
      isPartial: false,
      originalBookCount: 500,
    });

    expect(() => parseMetaShelfBackup(serialized)).toThrow(
      "META_SHELF_BACKUP_COUNT_MISMATCH",
    );
  });
});
