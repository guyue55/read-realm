import Dexie, { Table } from 'dexie';
import type { Book, ReadingProgress, Bookmark } from '@reader/shared-types';

export interface LocalChapter {
  id: string;
  bookId: string;
  index: number;
  title: string;
  content: string;
}

export class ReaderDatabase extends Dexie {
  books!: Table<Book, string>;
  chapters!: Table<LocalChapter, string>;
  progress!: Table<ReadingProgress, string>;
  bookmarks!: Table<Bookmark, string>; // NEW

  constructor() {
    super('ReaderDatabase');
    this.version(3).stores({
      books: 'id, title, createdAt, lastReadAt',
      chapters: 'id, bookId, index',
      progress: 'bookId',
      bookmarks: 'id, bookId, chapterIndex' // NEW
    });
  }
}

export const db = new ReaderDatabase();
