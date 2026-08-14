import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { IDBKeyRange, indexedDB } from "fake-indexeddb";
import type { Book, Bookmark, ReadingProgress } from "@reader/shared-types";
import {
  META_SHELF_BACKUP_KEY,
  META_SHELF_RECOVERY_GAP_KEY,
  buildBrowserMetaShelfBackup,
  parseMetaShelfBackup,
} from "./metadata-redundancy";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  failWritesFor: string | null = null;

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    if (key === this.failWritesFor) throw new Error("STORAGE_WRITE_FAILED");
    this.values.set(key, value);
  }
}

function makeBook(index: number): Book {
  return {
    id: `integration-book-${index}`,
    title: `Integration Book ${index}`,
    sourceType: "upload",
    format: "txt",
    status: "reading",
    tags: [],
    chapterCount: 1,
    createdAt: "2026-08-15T00:00:00.000Z",
    updatedAt: "2026-08-15T00:00:00.000Z",
  };
}

function makeProgress(book: Book): ReadingProgress {
  return {
    bookId: book.id,
    chapterId: `${book.id}-chapter-0`,
    chapterIndex: 0,
    offset: 0,
    percentage: 0,
    updatedAt: "2026-08-15T00:00:00.000Z",
  };
}

function makeBookmark(book: Book): Bookmark {
  return {
    id: `${book.id}-bookmark`,
    bookId: book.id,
    chapterIndex: 0,
    offset: 0,
    contentPreview: "integration bookmark",
    createdAt: "2026-08-15T00:00:00.000Z",
  };
}

describe("metadata backup and restore integration", () => {
  const storage = new MemoryStorage();
  let storageModule: typeof import("./db");

  beforeAll(async () => {
    Object.assign(globalThis, { indexedDB, IDBKeyRange });
    // Import before installing window so the singleton does not schedule AOP
    // backup timers during deterministic integration tests.
    storageModule = await import("./db");
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { localStorage: storage, navigator: {} },
    });
  });

  beforeEach(async () => {
    storage.clear();
    storage.failWritesFor = null;
    delete (window as typeof window & { Capacitor?: unknown }).Capacitor;
    storageModule.db.close();
    await storageModule.db.delete();
    await storageModule.db.open();
  });

  afterAll(async () => {
    storageModule.db.close();
    await storageModule.db.delete();
    Reflect.deleteProperty(globalThis, "window");
  });

  it("keeps reporting a persisted 100-of-500 recovery gap after restart", async () => {
    await storageModule.db.books.bulkPut(
      Array.from({ length: 100 }, (_, index) => makeBook(index)),
    );
    storage.setItem(META_SHELF_RECOVERY_GAP_KEY, "500");

    await expect(storageModule.checkAndRestoreFromBackup()).resolves.toEqual({
      status: "recovery_gap",
      restoredBookCount: 100,
      expectedBookCount: 500,
      source: null,
    });
  });

  it("does not infer data loss from a normal capped 500-book backup", async () => {
    await storageModule.db.books.bulkPut(
      Array.from({ length: 499 }, (_, index) => makeBook(index)),
    );
    const emergencyBackup = buildBrowserMetaShelfBackup({
      books: Array.from({ length: 500 }, (_, index) => makeBook(index)),
      progress: [],
      bookmarks: [],
      backupTime: "2026-08-15T00:00:00.000Z",
    });
    storage.setItem(META_SHELF_BACKUP_KEY, JSON.stringify(emergencyBackup));

    await expect(storageModule.checkAndRestoreFromBackup()).resolves.toEqual({
      status: "not_needed",
      restoredBookCount: 0,
      expectedBookCount: 499,
      source: null,
    });
  });

  it("does not perform a partial restore when its gap marker cannot persist", async () => {
    const emergencyBackup = buildBrowserMetaShelfBackup({
      books: Array.from({ length: 500 }, (_, index) => makeBook(index)),
      progress: [],
      bookmarks: [],
      backupTime: "2026-08-15T00:00:00.000Z",
    });
    storage.setItem(META_SHELF_BACKUP_KEY, JSON.stringify(emergencyBackup));
    storage.failWritesFor = META_SHELF_RECOVERY_GAP_KEY;

    await expect(storageModule.checkAndRestoreFromBackup()).resolves.toEqual({
      status: "failed",
      restoredBookCount: 0,
      expectedBookCount: 500,
      source: "browser",
    });
    await expect(storageModule.db.books.count()).resolves.toBe(0);
  });

  it("does not clear a book imported by another tab while native backup is loading", async () => {
    const archivedBook = makeBook(1);
    const serialized = JSON.stringify(
      buildBrowserMetaShelfBackup({
        books: [archivedBook],
        progress: [],
        bookmarks: [],
        backupTime: "2026-08-15T00:00:00.000Z",
      }),
    );
    let releaseRead: ((value: { data: string }) => void) | undefined;
    let markReadStarted: (() => void) | undefined;
    const readStarted = new Promise<void>((resolve) => {
      markReadStarted = resolve;
    });
    (window as typeof window & { Capacitor?: unknown }).Capacitor = {
      Plugins: {
        Filesystem: {
          readFile: () => {
            markReadStarted?.();
            return new Promise<{ data: string }>((resolve) => {
              releaseRead = resolve;
            });
          },
        },
        Directory: { Documents: "DOCUMENTS" },
      },
    };

    const restoring = storageModule.checkAndRestoreFromBackup();
    await readStarted;
    const concurrentBook = makeBook(2);
    await storageModule.db.books.put(concurrentBook);
    releaseRead?.({ data: serialized });

    await expect(restoring).resolves.toEqual({
      status: "not_needed",
      restoredBookCount: 0,
      expectedBookCount: 1,
      source: null,
    });
    await expect(storageModule.db.books.toArray()).resolves.toEqual([concurrentBook]);
  });

  it("backs up books, progress, and bookmarks from the real Dexie database", async () => {
    const item = makeBook(3);
    await storageModule.db.transaction(
      "rw",
      [storageModule.db.books, storageModule.db.progress, storageModule.db.bookmarks],
      async () => {
        await storageModule.db.books.put(item);
        await storageModule.db.progress.put(makeProgress(item));
        await storageModule.db.bookmarks.put(makeBookmark(item));
      },
    );

    await expect(storageModule.backupMetadataToStorage()).resolves.toMatchObject({
      status: "complete",
      storedBookCount: 1,
      expectedBookCount: 1,
    });
    const serialized = storage.getItem(META_SHELF_BACKUP_KEY);
    expect(serialized).not.toBeNull();
    const backup = parseMetaShelfBackup(serialized!);
    expect(backup.books.map(({ id }) => id)).toEqual([item.id]);
    expect(backup.progress.map(({ bookId }) => bookId)).toEqual([item.id]);
    expect(backup.bookmarks.map(({ bookId }) => bookId)).toEqual([item.id]);
  });

  it("still backs up a committed write when an overlapping write rolls back", async () => {
    const committedBook = makeBook(4);
    const rolledBackBook = makeBook(5);

    const committed = storageModule.executeSafeWriteTransaction(
      [storageModule.db.books],
      () => storageModule.db.books.put(committedBook),
    );
    const rolledBack = storageModule.executeSafeWriteTransaction(
      [storageModule.db.books],
      async () => {
        await storageModule.db.books.put(rolledBackBook);
        throw new Error("ROLL_BACK_SECOND_WRITE");
      },
    );

    const [committedResult, rolledBackResult] = await Promise.allSettled([
      committed,
      rolledBack,
    ]);
    expect(committedResult.status).toBe("fulfilled");
    expect(rolledBackResult.status).toBe("rejected");
    const backup = parseMetaShelfBackup(
      storage.getItem(META_SHELF_BACKUP_KEY)!,
    );
    expect(backup.books.map(({ id }) => id)).toEqual([committedBook.id]);
    await expect(storageModule.db.books.toArray()).resolves.toEqual([
      committedBook,
    ]);
  });
});
