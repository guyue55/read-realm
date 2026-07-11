import { describe, expect, it } from "vitest";
import type { NoteWithBook } from "./notes-filter";
import { filterNotes } from "./notes-filter";

const notes = [
  { id: "1", bookId: "book-1", chapterIndex: 0, contentPreview: "河流", note: "", createdAt: "2026-01-01", bookTitle: "甲" },
  { id: "2", bookId: "book-1", chapterIndex: 1, contentPreview: "山谷", note: "回声", createdAt: "2026-01-02", bookTitle: "甲" },
  { id: "3", bookId: "book-2", chapterIndex: 0, contentPreview: "山谷", note: "", createdAt: "2026-01-03", bookTitle: "乙" },
] as NoteWithBook[];

describe("filterNotes", () => {
  it("applies book and keyword filters together", () => {
    expect(filterNotes(notes, { bookId: "book-1", query: "山谷" })).toEqual([notes[1]]);
  });
});
