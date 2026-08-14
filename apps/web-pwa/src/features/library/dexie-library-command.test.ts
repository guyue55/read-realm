import "fake-indexeddb/auto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Book, LibraryFolder } from "@reader/shared-types";
import {
  META_SHELF_EMPTY_ACK_KEY,
  backupMetadataToStorage,
  checkAndRestoreFromBackup,
  db,
} from "@reader/storage-core";
import { libraryCommandService } from "./dexie-library-command";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
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
    this.values.set(key, value);
  }
}

const makeBook = (id: string): Book => ({
  id,
  title: id,
  sourceType: "upload",
  format: "txt",
  status: "reading",
  tags: [],
  chapterCount: 1,
  cacheStatus: "chapters_full",
  sourceAvailability: "full_cached",
  createdAt: "2026-08-15T00:00:00.000Z",
  updatedAt: "2026-08-15T00:00:00.000Z",
});

const makeFolder = (id: string): LibraryFolder => ({
  id,
  name: id,
  sourceType: "virtual",
  depth: 0,
  sortOrder: 0,
  createdAt: "2026-08-15T00:00:00.000Z",
  updatedAt: "2026-08-15T00:00:00.000Z",
});

describe("DexieLibraryCommandPort", () => {
  const storage = new MemoryStorage();

  beforeAll(() => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { localStorage: storage, navigator: {} },
    });
  });

  beforeEach(async () => {
    storage.clear();
    db.close();
    await db.delete();
    await db.open();
  });

  afterAll(async () => {
    db.close();
    await db.delete();
    Reflect.deleteProperty(globalThis, "window");
  });

  it("does not move a book into a missing folder", async () => {
    await db.books.put(makeBook("book-1"));

    await expect(
      libraryCommandService.moveBook("book-1", "missing"),
    ).resolves.toEqual({ status: "folder_not_found" });
    expect((await db.books.get("book-1"))?.sourceFolderId).toBeUndefined();
  });

  it("rolls back folder creation when the target book does not exist", async () => {
    await expect(
      libraryCommandService.createFolderAndMove("missing", "科幻"),
    ).resolves.toEqual({ status: "book_not_found" });
    await expect(db.libraryFolders.count()).resolves.toBe(0);
  });

  it("does not acknowledge an empty shelf for a missing-book no-op", async () => {
    await expect(libraryCommandService.removeBook("missing")).resolves.toEqual({
      status: "book_not_found",
    });
    expect(storage.getItem(META_SHELF_EMPTY_ACK_KEY)).toBeNull();
  });

  it("dissolves a folder and returns every assigned book to root", async () => {
    const folder = makeFolder("folder-1");
    await db.libraryFolders.put(folder);
    await db.books.bulkPut([
      { ...makeBook("book-1"), sourceFolderId: folder.id },
      { ...makeBook("book-2"), sourceFolderId: folder.id },
    ]);

    await expect(
      libraryCommandService.dissolveFolder(folder.id),
    ).resolves.toEqual({ status: "applied", affectedBookCount: 2 });
    await expect(db.libraryFolders.get(folder.id)).resolves.toBeUndefined();
    expect((await db.books.toArray()).every((book) => !book.sourceFolderId)).toBe(
      true,
    );
  });

  it("refuses to dissolve physical or referenced folder nodes", async () => {
    const physical = {
      ...makeFolder("physical"),
      sourceType: "imported_directory" as const,
    };
    const parent = makeFolder("parent");
    const child = { ...makeFolder("child"), parentId: parent.id, depth: 1 };
    await db.libraryFolders.bulkPut([physical, parent, child]);

    await expect(
      libraryCommandService.dissolveFolder(physical.id),
    ).resolves.toEqual({ status: "folder_not_dissolvable" });
    await expect(
      libraryCommandService.dissolveFolder(parent.id),
    ).resolves.toEqual({ status: "folder_not_dissolvable" });
    await expect(db.libraryFolders.count()).resolves.toBe(3);
  });

  it("removes the book and all local reading metadata atomically", async () => {
    const book = makeBook("book-1");
    await db.books.put(book);
    await db.chapters.put({
      id: "chapter-1",
      bookId: book.id,
      index: 0,
      title: "Chapter",
      content: "content",
    });
    await db.progress.put({
      bookId: book.id,
      chapterId: "chapter-1",
      chapterIndex: 0,
      offset: 0,
      percentage: 0,
      updatedAt: "2026-08-15T00:00:00.000Z",
    });
    await db.bookmarks.put({
      id: "bookmark-1",
      bookId: book.id,
      chapterIndex: 0,
      offset: 0,
      contentPreview: "note",
      createdAt: "2026-08-15T00:00:00.000Z",
    });
    await db.aiViews.put({
      id: "ai-view-1",
      bookId: book.id,
      chapterIndex: 0,
      sourceHash: "hash",
      summary: "summary",
      model: "local",
      promptVersion: "v1",
      createdAt: "2026-08-15T00:00:00.000Z",
    });
    await db.txtChapterIndices.put({
      chapterId: "chapter-1",
      bookId: book.id,
      title: "Chapter",
      index: 0,
      startOffset: 0,
      endOffset: 7,
      encoding: "utf-8",
    });
    await db.indexedNovelFiles.put({
      id: "indexed-file-1",
      sourceId: "source-1",
      name: "book.txt",
      relativePath: "book.txt",
      kind: "file",
      format: "txt",
      status: "parsed",
      bookId: book.id,
      createdAt: "2026-08-15T00:00:00.000Z",
      updatedAt: "2026-08-15T00:00:00.000Z",
    });
    await backupMetadataToStorage();

    await expect(libraryCommandService.removeBook(book.id)).resolves.toEqual({
      status: "applied",
      affectedBookCount: 1,
    });
    await expect(
      Promise.all([
        db.books.count(),
        db.chapters.count(),
        db.progress.count(),
        db.bookmarks.count(),
        db.aiViews.count(),
        db.txtChapterIndices.count(),
      ]),
    ).resolves.toEqual([0, 0, 0, 0, 0, 0]);
    const detachedIndex = await db.indexedNovelFiles.get("indexed-file-1");
    expect(detachedIndex?.status).toBe("indexed");
    expect(detachedIndex?.bookId).toBeUndefined();
    expect(storage.getItem(META_SHELF_EMPTY_ACK_KEY)).not.toBeNull();
    await expect(checkAndRestoreFromBackup()).resolves.toEqual({
      status: "not_needed",
      restoredBookCount: 0,
      expectedBookCount: 0,
      source: null,
    });
    await expect(db.books.count()).resolves.toBe(0);
  });

  it("offloads chapters and updates the cache truth in the same transaction", async () => {
    const book = makeBook("book-1");
    await db.books.put(book);
    await db.chapters.put({
      id: "chapter-1",
      bookId: book.id,
      index: 0,
      title: "Chapter",
      content: "content",
    });

    await expect(libraryCommandService.offloadBook(book.id)).resolves.toEqual({
      status: "applied",
      affectedBookCount: 1,
    });
    await expect(db.chapters.count()).resolves.toBe(0);
    await expect(db.books.get(book.id)).resolves.toMatchObject({
      cacheStatus: "metadata_only",
      sourceAvailability: "cloud_available",
    });
  });
});
