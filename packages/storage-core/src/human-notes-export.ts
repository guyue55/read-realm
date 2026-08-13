import type { Bookmark, Book } from "@reader/shared-types";

export interface CreateHumanNotesExportOptions {
  books: Book[];
  bookmarks: Bookmark[];
  createdAt?: string;
}

interface HumanNoteRecord {
  id: string;
  bookId: string;
  bookTitle: string;
  chapterNumber: number;
  offset: number;
  contentPreview?: string;
  note?: string;
  createdAt: string;
}

function buildNotes({
  books,
  bookmarks,
}: Pick<CreateHumanNotesExportOptions, "books" | "bookmarks">): HumanNoteRecord[] {
  const titles = new Map(books.map((book) => [book.id, book.title]));
  return bookmarks
    .map((bookmark) => ({
      id: bookmark.id,
      bookId: bookmark.bookId,
      bookTitle: titles.get(bookmark.bookId) ?? `未知书籍（${bookmark.bookId}）`,
      chapterNumber: bookmark.chapterIndex + 1,
      offset: bookmark.offset,
      ...(bookmark.contentPreview !== undefined
        ? { contentPreview: bookmark.contentPreview }
        : {}),
      ...(bookmark.note !== undefined ? { note: bookmark.note } : {}),
      createdAt: bookmark.createdAt,
    }))
    .sort(
      (left, right) =>
        left.bookTitle.localeCompare(right.bookTitle, "zh-CN") ||
        left.chapterNumber - right.chapterNumber ||
        left.offset - right.offset ||
        left.id.localeCompare(right.id),
    );
}

function escapeMarkdown(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/([`*_{}\[\]()#+.!|>~-])/g, "\\$1");
}

function quoteMarkdown(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

export function createHumanNotesJsonExport({
  books,
  bookmarks,
  createdAt = new Date().toISOString(),
}: CreateHumanNotesExportOptions): string {
  return `${JSON.stringify(
    {
      kind: "read-realm-human-notes",
      schemaVersion: 1,
      createdAt,
      notes: buildNotes({ books, bookmarks }),
    },
    null,
    2,
  )}\n`;
}

export function createHumanNotesMarkdownExport({
  books,
  bookmarks,
  createdAt = new Date().toISOString(),
}: CreateHumanNotesExportOptions): string {
  const notes = buildNotes({ books, bookmarks });
  const lines = [
    "# 墨问书签与笔记",
    "",
    `导出时间：${createdAt}`,
    `记录数量：${notes.length}`,
  ];
  let currentBook = "";
  for (const note of notes) {
    if (note.bookTitle !== currentBook) {
      currentBook = note.bookTitle;
      lines.push("", `## ${escapeMarkdown(currentBook)}`);
    }
    lines.push(
      "",
      `### 第 ${note.chapterNumber} 章`,
      "",
      `- 位置：${note.offset}`,
      `- 创建时间：${note.createdAt}`,
    );
    if (note.contentPreview) {
      lines.push("", quoteMarkdown(note.contentPreview));
    }
    if (note.note) {
      lines.push("", "笔记：", "", escapeMarkdown(note.note));
    }
  }
  return `${lines.join("\n")}\n`;
}
