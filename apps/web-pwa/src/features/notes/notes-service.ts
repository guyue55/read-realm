import type { Book, Bookmark } from "@reader/shared-types";
import {
  createHumanNotesJsonExport,
  createHumanNotesMarkdownExport,
} from "@reader/storage-core";
import type { NoteWithBook } from "./notes-filter";

export interface NotesSnapshot {
  books: readonly Book[];
  bookmarks: readonly Bookmark[];
}

export interface NotesPort {
  readSnapshot(): Promise<NotesSnapshot>;
  deleteBookmarkAtomic(id: string): Promise<"deleted" | "not_found">;
}

export interface NotesExport {
  content: string;
  fileName: string;
  mediaType: "text/markdown" | "application/json";
}

export class NotesService {
  constructor(
    private readonly port: NotesPort,
    private readonly dependencies: { now: () => string } = {
      now: () => new Date().toISOString(),
    },
  ) {}

  async readNotes(): Promise<NoteWithBook[]> {
    const { books, bookmarks } = await this.port.readSnapshot();
    const titles = new Map(books.map((book) => [book.id, book.title]));
    return bookmarks
      .map((note) => ({
        ...note,
        bookTitle: titles.get(note.bookId) ?? "未知书籍",
      }))
      .sort(
        (left, right) =>
          Date.parse(right.createdAt) - Date.parse(left.createdAt) ||
          left.id.localeCompare(right.id),
      );
  }

  async deleteNote(id: string): Promise<{ status: "deleted" | "not_found" }> {
    return { status: await this.port.deleteBookmarkAtomic(id) };
  }

  async createExport(format: "markdown" | "json"): Promise<NotesExport> {
    const { books, bookmarks } = await this.port.readSnapshot();
    const createdAt = this.dependencies.now();
    const markdown = format === "markdown";
    return {
      content: markdown
        ? createHumanNotesMarkdownExport({
            books: [...books],
            bookmarks: [...bookmarks],
            createdAt,
          })
        : createHumanNotesJsonExport({
            books: [...books],
            bookmarks: [...bookmarks],
            createdAt,
          }),
      fileName: `read-realm-notes-${createdAt.slice(0, 10)}.${markdown ? "md" : "json"}`,
      mediaType: markdown ? "text/markdown" : "application/json",
    };
  }
}
