import "fake-indexeddb/auto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Book, LocalChapter } from "@reader/shared-types";
import { db } from "@reader/storage-core";
import { publicLibraryLocalPort } from "./dexie-public-library-local";

const book: Book = {
  id: "local-public-1",
  title: "离线馆藏",
  sourceType: "cloud_cache",
  format: "txt",
  status: "to_read",
  tags: ["经典"],
  chapterCount: 2,
  wordCount: 4,
  cacheStatus: "chapters_full",
  sourceAvailability: "full_cached",
  createdAt: "2026-08-15T00:00:00.000Z",
  updatedAt: "2026-08-15T00:00:00.000Z",
};

const chapters: LocalChapter[] = [
  {
    id: "local-public-1-chapter-0",
    bookId: book.id,
    index: 0,
    title: "第一章",
    content: "甲乙",
  },
  {
    id: "local-public-1-chapter-1",
    bookId: book.id,
    index: 1,
    title: "第二章",
    content: "丙丁",
  },
];

describe("publicLibraryLocalPort", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    db.close();
    await db.delete();
    await db.open();
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    db.close();
    await db.delete();
  });

  it("commits the complete detached book and every chapter in one transaction", async () => {
    await publicLibraryLocalPort.apply({ book, chapters });

    await expect(db.books.get(book.id)).resolves.toEqual(book);
    await expect(
      db.chapters.where("bookId").equals(book.id).sortBy("index"),
    ).resolves.toEqual(chapters);
    const saved = await db.books.get(book.id);
    expect(saved).not.toHaveProperty("publicBookId");
    expect(saved).not.toHaveProperty("publicLibraryUrl");
  });

  it("preserves an existing local identity without touching its chapters", async () => {
    const existing = { ...book, title: "本地原书", chapterCount: 1 };
    const existingChapter = { ...chapters[0], content: "本地原文" };
    await db.books.add(existing);
    await db.chapters.add(existingChapter);

    await expect(
      publicLibraryLocalPort.apply({ book, chapters }),
    ).rejects.toThrow("LOCAL_BOOK_ID_CONFLICT");
    await expect(db.books.get(book.id)).resolves.toEqual(existing);
    await expect(
      db.chapters.where("bookId").equals(book.id).toArray(),
    ).resolves.toEqual([existingChapter]);
  });

  it("rolls back the book when chapter insertion fails", async () => {
    vi.spyOn(db.chapters, "bulkAdd").mockRejectedValueOnce(
      new Error("INJECTED_CHAPTER_WRITE_FAILURE"),
    );

    await expect(
      publicLibraryLocalPort.apply({ book, chapters }),
    ).rejects.toThrow("INJECTED_CHAPTER_WRITE_FAILURE");
    await expect(db.books.count()).resolves.toBe(0);
    await expect(db.chapters.count()).resolves.toBe(0);
  });

  it("refuses an orphan chapter that already occupies the generated book identity", async () => {
    const orphan = {
      ...chapters[0],
      id: "orphan-chapter",
      content: "不得混入新书",
    };
    await db.chapters.add(orphan);

    await expect(
      publicLibraryLocalPort.apply({ book, chapters }),
    ).rejects.toThrow("LOCAL_BOOK_ID_CONFLICT");
    await expect(db.books.count()).resolves.toBe(0);
    await expect(
      db.chapters.where("bookId").equals(book.id).toArray(),
    ).resolves.toEqual([orphan]);
  });

  it("rolls back when chapter readback is not byte-for-byte complete", async () => {
    const bulkGet = db.chapters.bulkGet.bind(db.chapters);
    vi.spyOn(db.chapters, "bulkGet").mockImplementationOnce(
      (ids) =>
        bulkGet(ids).then((saved) =>
          saved.map((chapter, index) =>
            index === 1 && chapter
              ? { ...chapter, content: "被篡改" }
              : chapter,
          ),
        ) as ReturnType<typeof db.chapters.bulkGet>,
    );

    await expect(
      publicLibraryLocalPort.apply({ book, chapters }),
    ).rejects.toThrow("PUBLIC_LIBRARY_LOCAL_READBACK_FAILED");
    await expect(db.books.count()).resolves.toBe(0);
    await expect(db.chapters.count()).resolves.toBe(0);
  });
});

describe("getLocalStateForPublicBook & getBatchLocalStatesForPublicBooks", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    db.close();
    await db.delete();
    await db.open();
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    db.close();
    await db.delete();
  });

  it("returns null state when public book is not on shelf", async () => {
    const { getLocalStateForPublicBook } = await import(
      "./dexie-public-library-local"
    );
    const state = await getLocalStateForPublicBook({
      title: "未入架的书",
      author: "作者",
      chapterCount: 10,
    });
    expect(state.localBook).toBeUndefined();
    expect(state.progress).toBeUndefined();
  });

  it("matches local book and retrieves reading progress", async () => {
    const { getLocalStateForPublicBook, getBatchLocalStatesForPublicBooks } =
      await import("./dexie-public-library-local");

    await db.books.add(book);
    await db.progress.add({
      bookId: book.id,
      chapterId: chapters[1].id,
      chapterIndex: 1,
      offset: 100,
      percentage: 50,
      updatedAt: "2026-08-16T00:00:00.000Z",
    });

    const singleState = await getLocalStateForPublicBook({
      title: "离线馆藏",
      author: "",
      chapterCount: 2,
    });
    expect(singleState.localBook).toBeDefined();
    expect(singleState.localBook?.id).toBe(book.id);
    expect(singleState.progress?.chapterIndex).toBe(1);
    expect(singleState.progress?.percentage).toBe(50);

    const batchStates = await getBatchLocalStatesForPublicBooks([
      {
        id: "pub-1",
        title: "离线馆藏",
        author: "",
        format: "txt",
        chapterCount: 2,
        wordCount: 4,
        category: "经典",
        contentHash: "hash-1",
        tags: [],
        maintainerLabel: "",
        publishedAt: "2026-08-15T00:00:00.000Z",
      },
      {
        id: "pub-2",
        title: "另一本不在书架的书",
        author: "未知",
        format: "txt",
        chapterCount: 5,
        wordCount: 100,
        category: "文学",
        contentHash: "hash-2",
        tags: [],
        maintainerLabel: "",
        publishedAt: "2026-08-15T00:00:00.000Z",
      },
    ]);

    expect(batchStates.size).toBe(2);
    expect(batchStates.get("pub-1")?.localBook?.id).toBe(book.id);
    expect(batchStates.get("pub-1")?.progress?.chapterIndex).toBe(1);
    expect(batchStates.get("pub-2")?.localBook).toBeUndefined();
    expect(batchStates.get("pub-2")?.progress).toBeUndefined();
  });
});
