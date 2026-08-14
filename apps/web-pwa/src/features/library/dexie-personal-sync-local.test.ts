import "fake-indexeddb/auto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Book, LocalChapter, ReadingProgress } from "@reader/shared-types";
import { db } from "@reader/storage-core";
import { personalSyncLocalStore } from "./dexie-personal-sync-local";

const book = (overrides: Partial<Book> = {}): Book => ({
  id: "book-1",
  title: "原子下载样本",
  sourceType: "cloud_cache",
  format: "epub",
  status: "reading",
  tags: [],
  chapterCount: 2,
  createdAt: "2026-08-15T00:00:00.000Z",
  updatedAt: "2026-08-15T00:00:00.000Z",
  ...overrides,
});

const chapters: LocalChapter[] = [
  { id: "chapter-0", bookId: "book-1", index: 0, title: "一", content: "甲" },
  { id: "chapter-1", bookId: "book-1", index: 1, title: "二", content: "乙" },
];

const progress: ReadingProgress = {
  bookId: "book-1",
  chapterId: "chapter-0",
  chapterIndex: 0,
  offset: 0,
  percentage: 10,
  updatedAt: "2026-08-15T00:00:00.000Z",
};

describe("DexiePersonalSyncLocalStore", () => {
  beforeEach(async () => {
    db.close();
    await db.delete();
    await db.open();
  });

  afterAll(async () => {
    db.close();
    await db.delete();
  });

  it("commits book, complete chapters, progress, and cache truth atomically", async () => {
    await personalSyncLocalStore.applyDownloadedBook({ book: book(), chapters, progress });

    await expect(db.books.get("book-1")).resolves.toMatchObject({
      cacheStatus: "chapters_full",
      sourceAvailability: "full_cached",
      chapterCount: 2,
    });
    await expect(db.chapters.where("bookId").equals("book-1").count()).resolves.toBe(2);
    await expect(db.progress.get("book-1")).resolves.toEqual(progress);
  });

  it("reads only a complete, ordered local bundle for upload", async () => {
    await db.books.put(book());
    await db.chapters.bulkPut([...chapters].reverse());
    await db.progress.put(progress);

    await expect(personalSyncLocalStore.readUploadBundle("book-1")).resolves.toEqual({
      book: book(),
      chapters,
      progress,
    });
  });

  it("rejects a partial local upload bundle", async () => {
    await db.books.put(book());
    await db.chapters.put(chapters[0]);

    await expect(
      personalSyncLocalStore.readUploadBundle("book-1"),
    ).rejects.toMatchObject({ code: "invalid_local_upload" });
  });

  it("refuses offload when chapters changed after the verified snapshot", async () => {
    await db.books.put(book());
    await db.chapters.bulkPut(chapters);
    const verified = await personalSyncLocalStore.readUploadBundle("book-1");
    await db.chapters.put({ ...chapters[0], content: "核验后出现的新正文" });

    await expect(
      personalSyncLocalStore.offloadIfSnapshotMatches(verified),
    ).rejects.toMatchObject({ code: "local_copy_changed_after_verification" });
    await expect(db.chapters.where("bookId").equals("book-1").count()).resolves.toBe(2);
  });

  it("rejects an incomplete bundle before touching an existing local copy", async () => {
    const existing = book({ title: "本地原件", chapterCount: 1 });
    const existingChapter = { ...chapters[0], content: "本地完整正文" };
    await db.books.put(existing);
    await db.chapters.put(existingChapter);

    await expect(
      personalSyncLocalStore.applyDownloadedBook({
        book: book(),
        chapters: chapters.slice(0, 1),
        progress,
      }),
    ).rejects.toMatchObject({ code: "invalid_download_bundle" });

    await expect(db.books.get("book-1")).resolves.toEqual(existing);
    await expect(db.chapters.get("chapter-0")).resolves.toEqual(existingChapter);
  });

  it("rejects foreign progress and chapters with zero writes", async () => {
    await expect(
      personalSyncLocalStore.applyDownloadedBook({
        book: book(),
        chapters: chapters.map((chapter) => ({ ...chapter, bookId: "other" })),
        progress: { ...progress, bookId: "other" },
      }),
    ).rejects.toMatchObject({ code: "invalid_download_bundle" });

    await expect(db.books.count()).resolves.toBe(0);
    await expect(db.chapters.count()).resolves.toBe(0);
    await expect(db.progress.count()).resolves.toBe(0);
  });
});
