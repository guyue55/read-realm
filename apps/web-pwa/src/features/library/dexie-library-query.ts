import { db } from "@reader/storage-core";
import {
  LibraryQueryService,
  type LibraryQueryPort,
  type RawLibrarySnapshot,
} from "./library-query-service";

export class DexieLibraryQueryPort implements LibraryQueryPort {
  async readSnapshot(): Promise<RawLibrarySnapshot> {
    return db.transaction(
      "r",
      [db.books, db.libraryFolders, db.progress, db.chapters, db.bookmarks],
      async () => {
        const [books, folders, progress, cachedKeys, totalNotesCount] =
          await Promise.all([
            db.books.toArray(),
            db.libraryFolders.toArray(),
            db.progress.toArray(),
            db.chapters.orderBy("bookId").uniqueKeys(),
            db.bookmarks.count(),
          ]);
        return {
          books,
          folders,
          progress,
          cachedBookIds: cachedKeys.filter(
            (key): key is string => typeof key === "string",
          ),
          totalNotesCount,
        };
      },
    );
  }

  async readSyncInventory() {
    return db.transaction("r", [db.books, db.libraryFolders], async () => {
      const [books, folders] = await Promise.all([
        db.books.toArray(),
        db.libraryFolders.toArray(),
      ]);
      return { books, folders };
    });
  }
}

export const libraryQueryService = new LibraryQueryService(
  new DexieLibraryQueryPort(),
);
