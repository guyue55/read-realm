import Dexie, { Table } from "dexie";
import type { Book, ReadingProgress, Bookmark } from "@reader/shared-types";

export interface LocalChapter {
  id: string;
  bookId: string;
  index: number;
  title: string;
  content: string;
}

export interface ImportTask {
  id: string;
  bookMetadata: Book;
  chapters: LocalChapter[];
  createdAt: string;
}

export class ReaderDatabase extends Dexie {
  books!: Table<Book, string>;
  chapters!: Table<LocalChapter, string>;
  progress!: Table<ReadingProgress, string>;
  bookmarks!: Table<Bookmark, string>;
  importTasks!: Table<ImportTask, string>;

  constructor() {
    super("ReaderDatabase");
    this.version(5).stores({
      books: "id, title, createdAt, lastReadAt",
      chapters: "id, [bookId+index], bookId, index",
      progress: "bookId",
      bookmarks: "id, bookId, chapterIndex",
      importTasks: "id",
    });
  }
}

export const db = new ReaderDatabase();
