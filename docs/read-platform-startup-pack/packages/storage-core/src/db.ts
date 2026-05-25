import Dexie, { Table } from 'dexie';
import type { Book, ReadingProgress } from '@reader/shared-types';

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

  constructor() {
    super('ReaderDatabase');
    // Bump version to 2
    this.version(2).stores({
      books: 'id, title, createdAt, lastReadAt',
      chapters: 'id, bookId, index',
      progress: 'bookId' // bookId is primary key here for 1:1 relation
    });
  }
}

export const db = new ReaderDatabase();
