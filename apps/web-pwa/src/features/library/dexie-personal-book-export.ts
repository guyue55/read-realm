import { db } from "@reader/storage-core";
import type { PersonalBookExportLocalPort } from "./personal-book-export";

export class DexiePersonalBookExportLocalPort implements PersonalBookExportLocalPort {
  async readCandidate(bookId: string) {
    return db.transaction("r", [db.books, db.chapters], async () => {
      const [book, chapters] = await Promise.all([
        db.books.get(bookId),
        db.chapters.where("bookId").equals(bookId).sortBy("index"),
      ]);
      return book ? { book, chapters } : undefined;
    });
  }
}

export const dexiePersonalBookExportLocalPort =
  new DexiePersonalBookExportLocalPort();
