import { describe, expect, it } from "vitest";
import type { Bookmark, Book } from "@reader/shared-types";
import {
  createHumanNotesJsonExport,
  createHumanNotesMarkdownExport,
} from "./human-notes-export";

const books: Book[] = [
  {
    id: "book-1",
    title: "纸上世界",
    sourceType: "upload",
    format: "txt",
    status: "reading",
    tags: [],
    chapterCount: 3,
    createdAt: "2026-08-13T20:00:00+08:00",
    updatedAt: "2026-08-13T20:00:00+08:00",
  },
];

const bookmarks: Bookmark[] = [
  {
    id: "bookmark-2",
    bookId: "book-1",
    chapterIndex: 1,
    offset: 20,
    contentPreview: "第二段\n跨行摘录",
    note: "记住 **重点**",
    createdAt: "2026-08-13T21:00:00+08:00",
  },
  {
    id: "bookmark-1",
    bookId: "book-1",
    chapterIndex: 0,
    offset: 10,
    contentPreview: "第一段",
    createdAt: "2026-08-13T20:30:00+08:00",
  },
];

describe("human notes export", () => {
  it("creates stable public JSON without device or credential fields", () => {
    const output = createHumanNotesJsonExport({
      books,
      bookmarks,
      createdAt: "2026-08-13T22:00:00+08:00",
    });
    expect(JSON.parse(output)).toEqual({
      kind: "read-realm-human-notes",
      schemaVersion: 1,
      createdAt: "2026-08-13T22:00:00+08:00",
      notes: [
        expect.objectContaining({ id: "bookmark-1", bookTitle: "纸上世界", chapterNumber: 1 }),
        expect.objectContaining({ id: "bookmark-2", bookTitle: "纸上世界", chapterNumber: 2 }),
      ],
    });
    expect(output.endsWith("\n")).toBe(true);
  });

  it("creates readable Markdown with escaped structure and quoted excerpts", () => {
    const output = createHumanNotesMarkdownExport({
      books,
      bookmarks,
      createdAt: "2026-08-13T22:00:00+08:00",
    });
    expect(output).toContain("# 墨问书签与笔记");
    expect(output).toContain("## 纸上世界");
    expect(output).toContain("### 第 2 章");
    expect(output).toContain("> 第二段\n> 跨行摘录");
    expect(output).toContain("记住 \\*\\*重点\\*\\*");
  });

  it("labels missing books without dropping the user note", () => {
    const output = createHumanNotesJsonExport({
      books: [],
      bookmarks: [bookmarks[0]!],
      createdAt: "2026-08-13T22:00:00+08:00",
    });
    expect(JSON.parse(output).notes[0]).toMatchObject({
      bookTitle: "未知书籍（book-1）",
      note: "记住 **重点**",
    });
  });
});
