import "fake-indexeddb/auto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Book, LocalChapter, ReadingProgress } from "@reader/shared-types";
import { db } from "@reader/storage-core";
import { dexiePersonalBookExportLocalPort } from "./dexie-personal-book-export";

const book: Book = {
  id: "book-1",
  title: "只读导出",
  sourceType: "cloud_cache",
  format: "txt",
  status: "reading",
  tags: [],
  chapterCount: 1,
  cacheStatus: "chapters_full",
  sourceAvailability: "full_cached",
  createdAt: "2026-08-15T09:00:00.000Z",
  updatedAt: "2026-08-15T09:00:00.000Z",
};
const chapter: LocalChapter = {
  id: "chapter-0",
  bookId: "book-1",
  index: 0,
  title: "第一章",
  content: "正文",
};
const progress: ReadingProgress = {
  bookId: "book-1",
  chapterId: "chapter-0",
  chapterIndex: 0,
  offset: 7,
  percentage: 33,
  updatedAt: "2026-08-15T09:01:00.000Z",
};

describe("DexiePersonalBookExportLocalPort", () => {
  beforeEach(async () => {
    db.close();
    await db.delete();
    await db.open();
  });

  afterAll(async () => {
    db.close();
    await db.delete();
  });

  it("reads one atomic candidate without changing personal facts", async () => {
    await db.books.put(book);
    await db.chapters.put(chapter);
    await db.progress.put(progress);
    const before = {
      books: await db.books.toArray(),
      chapters: await db.chapters.toArray(),
      progress: await db.progress.toArray(),
      bookmarks: await db.bookmarks.toArray(),
    };

    await expect(
      dexiePersonalBookExportLocalPort.readCandidate("book-1"),
    ).resolves.toEqual({ book, chapters: [chapter] });
    await expect(
      Promise.all([
        db.books.toArray(),
        db.chapters.toArray(),
        db.progress.toArray(),
        db.bookmarks.toArray(),
      ]),
    ).resolves.toEqual([
      before.books,
      before.chapters,
      before.progress,
      before.bookmarks,
    ]);
  });
});
