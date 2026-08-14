import { describe, expect, it, vi } from "vitest";
import type { Book, LibraryFolder, ReadingProgress } from "@reader/shared-types";
import {
  countLibraryBooksByFolder,
  paginateLibraryBooks,
  LibraryQueryService,
  selectVisibleLibraryBooks,
  type LibraryQueryPort,
} from "./library-query-service";

function book(id: string, title: string, updatedAt: string, sourceFolderId?: string): Book {
  return {
    id,
    title,
    sourceType: "upload",
    format: "epub",
    status: "reading",
    tags: [],
    chapterCount: 3,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt,
    sourceFolderId,
  };
}

function folder(id: string, name: string): LibraryFolder {
  return {
    id,
    name,
    sourceType: "virtual",
    depth: 0,
    sortOrder: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function progress(bookId: string): ReadingProgress {
  return {
    bookId,
    chapterId: `${bookId}-chapter-1`,
    chapterIndex: 0,
    offset: 0,
    percentage: 10,
    updatedAt: "2026-02-01T00:00:00.000Z",
  };
}

function createPort(): LibraryQueryPort & {
  readSnapshot: ReturnType<typeof vi.fn>;
  readSyncInventory: ReturnType<typeof vi.fn>;
} {
  const books = [
    book("older", "乙书", "2026-01-02T00:00:00.000Z"),
    book("newer", "甲书", "2026-01-03T00:00:00.000Z"),
  ];
  const folders = [folder("folder-1", "一阁")];
  return {
    readSnapshot: vi.fn(async () => ({
      books,
      folders,
      progress: [progress("newer")],
      cachedBookIds: ["newer", "newer"],
      totalNotesCount: 4,
    })),
    readSyncInventory: vi.fn(async () => ({ books, folders })),
  };
}

describe("LibraryQueryService", () => {
  it("reads one stable shelf snapshot without mutating repository arrays", async () => {
    const port = createPort();
    const raw = await port.readSnapshot();
    const sourceBooks = raw.books;
    port.readSnapshot.mockClear();
    port.readSnapshot.mockResolvedValue(raw);
    const service = new LibraryQueryService(port);

    const snapshot = await service.readSnapshot("recent");

    expect(snapshot.books.map((item) => item.id)).toEqual(["newer", "older"]);
    expect(sourceBooks.map((item: Book) => item.id)).toEqual(["older", "newer"]);
    expect(snapshot.progressByBookId).toEqual({ newer: progress("newer") });
    expect(snapshot.cachedBookIds).toEqual(new Set(["newer"]));
    expect(snapshot.totalNotesCount).toBe(4);
    expect(port.readSnapshot).toHaveBeenCalledTimes(1);
  });

  it("sorts titles deterministically and keeps ID as the final tie breaker", async () => {
    const port = createPort();
    port.readSnapshot.mockResolvedValue({
      books: [
        book("b", "Same", "2026-01-03T00:00:00.000Z"),
        book("a", "Same", "2026-01-03T00:00:00.000Z"),
        book("c", "A book", "2026-01-02T00:00:00.000Z"),
      ],
      folders: [],
      progress: [],
      cachedBookIds: [],
      totalNotesCount: 0,
    });

    const snapshot = await new LibraryQueryService(port).readSnapshot("title");

    expect(snapshot.books.map((item) => item.id)).toEqual(["c", "a", "b"]);
  });

  it("keeps a 500-book metadata snapshot complete and deterministic", async () => {
    const port = createPort();
    const books = Array.from({ length: 500 }, (_, index) =>
      book(
        `book-${String(index).padStart(3, "0")}`,
        `Book ${String(index).padStart(3, "0")}`,
        "2026-01-03T00:00:00.000Z",
      ),
    ).reverse();
    port.readSnapshot.mockResolvedValue({
      books,
      folders: [],
      progress: books.map((item) => progress(item.id)),
      cachedBookIds: books.map((item) => item.id),
      totalNotesCount: 500,
    });

    const snapshot = await new LibraryQueryService(port).readSnapshot("recent");

    expect(snapshot.books).toHaveLength(500);
    expect(Object.keys(snapshot.progressByBookId)).toHaveLength(500);
    expect(snapshot.cachedBookIds.size).toBe(500);
    expect(snapshot.books[0]?.id).toBe("book-000");
    expect(snapshot.books[499]?.id).toBe("book-499");
  });
});

describe("selectVisibleLibraryBooks", () => {
  const folders = [folder("kept", "存续书箧")];
  const local = [
    book("local", "本地本", "2026-03-03T00:00:00.000Z", "kept"),
    book("orphan", "孤儿本", "2026-03-02T00:00:00.000Z", "missing"),
  ];
  const cloud = [
    book("local", "云端旧副本", "2026-03-04T00:00:00.000Z"),
    book("cloud", "仅云端", "2026-03-01T00:00:00.000Z"),
  ];

  it("lets the local fact win and returns orphaned books to the root shelf", () => {
    const root = selectVisibleLibraryBooks({
      localBooks: local,
      cloudBooks: cloud,
      folders,
      currentFolderId: undefined,
      sortBy: "recent",
    });

    expect(root.map((item) => item.id)).toEqual(["orphan", "cloud"]);
    expect(root.find((item) => item.id === "local")).toBeUndefined();
  });

  it("shows only books assigned to the selected folder", () => {
    const selected = selectVisibleLibraryBooks({
      localBooks: local,
      cloudBooks: cloud,
      folders,
      currentFolderId: "kept",
      sortBy: "recent",
    });

    expect(selected.map((item) => item.id)).toEqual(["local"]);
    expect(selected[0]?.title).toBe("本地本");
  });
});

describe("bounded library rendering", () => {
  const books = Array.from({ length: 500 }, (_, index) =>
    book(
      `book-${String(index).padStart(3, "0")}`,
      `Book ${String(index).padStart(3, "0")}`,
      "2026-03-03T00:00:00.000Z",
      index < 120 ? "folder-a" : index < 200 ? "folder-b" : undefined,
    ),
  );

  it("keeps the complete result count while exposing at most 60 books per page", () => {
    const first = paginateLibraryBooks(books, 1, 60);
    const last = paginateLibraryBooks(books, 9, 60);

    expect(first.totalItems).toBe(500);
    expect(first.totalPages).toBe(9);
    expect(first.items).toHaveLength(60);
    expect(first.rangeStart).toBe(1);
    expect(first.rangeEnd).toBe(60);
    expect(last.items).toHaveLength(20);
    expect(last.rangeStart).toBe(481);
    expect(last.rangeEnd).toBe(500);
  });

  it("covers every book exactly once across the 48-book UI pages", () => {
    const pages = Array.from({ length: Math.ceil(books.length / 48) }, (_, index) =>
      paginateLibraryBooks(books, index + 1, 48),
    );
    const renderedIds = pages.flatMap((page) => page.items.map((item) => item.id));

    expect(renderedIds).toHaveLength(500);
    expect(new Set(renderedIds).size).toBe(500);
    expect(renderedIds).toEqual(books.map((item) => item.id));
  });

  it("clamps a stale page after deletion instead of rendering a blank shelf", () => {
    const result = paginateLibraryBooks(books.slice(0, 61), 9, 60);

    expect(result.page).toBe(2);
    expect(result.items.map((item) => item.id)).toEqual(["book-060"]);
  });

  it("counts folder membership in one index without changing the book collection", () => {
    const counts = countLibraryBooksByFolder(books);

    expect(counts.get("folder-a")).toBe(120);
    expect(counts.get("folder-b")).toBe(80);
    expect(counts.has("missing")).toBe(false);
    expect(books).toHaveLength(500);
  });
});
