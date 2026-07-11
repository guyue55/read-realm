import { describe, expect, it } from "vitest";
import type { Book, ReadingProgress } from "@reader/shared-types";
import { getLibraryEmptyState, selectContinueBook } from "./library-state";

function createBook(id: string, lastReadAt?: string): Book {
  return {
    id,
    title: `Book ${id}`,
    sourceType: "upload",
    format: "epub",
    status: "reading",
    tags: [],
    chapterCount: 10,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    lastReadAt,
  };
}

function createProgress(bookId: string, updatedAt: string): ReadingProgress {
  return {
    bookId,
    chapterId: `${bookId}-chapter-1`,
    chapterIndex: 0,
    offset: 0,
    percentage: 0,
    updatedAt,
  };
}

describe("selectContinueBook", () => {
  it("returns null when no book has real reading progress", () => {
    expect(selectContinueBook([createBook("book-1")], new Map())).toBeNull();
  });

  it("ignores progress whose bookId does not match the map key", () => {
    const book = createBook("book-1", "2026-06-01T00:00:00.000Z");
    const progress = new Map([
      ["book-1", createProgress("another-book", "2026-07-01T00:00:00.000Z")],
    ]);

    expect(selectContinueBook([book], progress)).toBeNull();
  });

  it("selects the latest real reading using book and progress timestamps", () => {
    const latestByBook = createBook("book-1", "2026-07-03T00:00:00.000Z");
    const latestByProgress = createBook("book-2", "2026-07-01T00:00:00.000Z");
    const progress = new Map([
      ["book-1", createProgress("book-1", "2026-07-01T00:00:00.000Z")],
      ["book-2", createProgress("book-2", "2026-07-04T00:00:00.000Z")],
    ]);

    expect(selectContinueBook([latestByBook, latestByProgress], progress)).toBe(
      latestByProgress,
    );
  });
});

describe("getLibraryEmptyState", () => {
  it("returns empty only for an empty library", () => {
    expect(getLibraryEmptyState([])).toBe("empty");
    expect(getLibraryEmptyState([createBook("book-1")])).toBe("ready");
  });
});
