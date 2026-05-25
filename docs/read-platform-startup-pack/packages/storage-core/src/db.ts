import Dexie, { Table } from 'dexie';
import type { Book } from '@reader/shared-types';

export class ReaderDatabase extends Dexie {
  books!: Table<Book, string>;

  constructor() {
    super('ReaderDatabase');
    this.version(1).stores({
      books: 'id, title, createdAt, lastReadAt'
    });
  }
}

export const db = new ReaderDatabase();
