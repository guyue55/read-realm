import { db, executeSafeWriteTransaction } from "@reader/storage-core";
import { NotesService, type NotesPort } from "./notes-service";

export class DexieNotesPort implements NotesPort {
  readSnapshot() {
    return db.transaction("r", [db.books, db.bookmarks], async () => {
      const [books, bookmarks] = await Promise.all([
        db.books.toArray(),
        db.bookmarks.toArray(),
      ]);
      return { books, bookmarks };
    });
  }

  deleteBookmarkAtomic(id: string) {
    return executeSafeWriteTransaction([db.bookmarks], async () => {
      if (!(await db.bookmarks.get(id))) return "not_found" as const;
      await db.bookmarks.delete(id);
      if (await db.bookmarks.get(id)) {
        throw new Error("NOTE_DELETE_READBACK_FAILED");
      }
      return "deleted" as const;
    });
  }
}

export const notesService = new NotesService(new DexieNotesPort());
