import { describe, expect, it } from "vitest";
import type { Book, Bookmark } from "@reader/shared-types";
import {
  NotesService,
  type NotesPort,
  type NotesSnapshot,
} from "./notes-service";

const book = {
  id: "book-1",
  title: "本地书",
  sourceType: "upload",
  format: "txt",
  status: "reading",
  tags: [],
  chapterCount: 1,
  createdAt: "2026-08-15T00:00:00.000Z",
  updatedAt: "2026-08-15T00:00:00.000Z",
} as Book;

const note = {
  id: "note-1",
  bookId: book.id,
  chapterIndex: 0,
  contentPreview: "河流",
  note: "摘录",
  createdAt: "2026-08-15T00:00:00.000Z",
} as Bookmark;

class MemoryNotesPort implements NotesPort {
  snapshot: NotesSnapshot = { books: [book], bookmarks: [note] };
  deleteResult: "deleted" | "not_found" = "deleted";

  readSnapshot() {
    return Promise.resolve(this.snapshot);
  }

  deleteBookmarkAtomic() {
    if (this.deleteResult === "deleted") {
      this.snapshot = { ...this.snapshot, bookmarks: [] };
    }
    return Promise.resolve(this.deleteResult);
  }
}

describe("NotesService", () => {
  it("joins books and bookmarks from one snapshot and sorts newest first", async () => {
    const port = new MemoryNotesPort();
    port.snapshot = {
      books: [book],
      bookmarks: [
        { ...note, id: "older", createdAt: "2026-08-14T00:00:00.000Z" },
        note,
      ],
    };

    await expect(new NotesService(port).readNotes()).resolves.toEqual([
      expect.objectContaining({ id: "note-1", bookTitle: "本地书" }),
      expect.objectContaining({ id: "older", bookTitle: "本地书" }),
    ]);
  });

  it("returns an explicit not-found result instead of claiming deletion", async () => {
    const port = new MemoryNotesPort();
    port.deleteResult = "not_found";

    await expect(new NotesService(port).deleteNote("missing")).resolves.toEqual({
      status: "not_found",
    });
  });

  it("builds exports from one fresh snapshot", async () => {
    const service = new NotesService(new MemoryNotesPort(), {
      now: () => "2026-08-15T01:02:03.000Z",
    });

    await expect(service.createExport("markdown")).resolves.toMatchObject({
      fileName: "read-realm-notes-2026-08-15.md",
      mediaType: "text/markdown",
      content: expect.stringContaining("本地书"),
    });
  });
});
