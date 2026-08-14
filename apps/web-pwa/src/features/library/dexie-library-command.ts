import { createId } from "@reader/shared-types";
import { db, executeSafeWriteTransaction } from "@reader/storage-core";
import {
  LibraryCommandService,
  type LibraryCommandPort,
  type LibraryCommandResult,
} from "./library-command-service";

function assertMutation(condition: boolean) {
  if (!condition) throw new Error("LIBRARY_COMMAND_READBACK_FAILED");
}

export class DexieLibraryCommandPort implements LibraryCommandPort {
  moveBookAtomic({
    bookId,
    folderId,
    updatedAt,
  }: {
    bookId: string;
    folderId?: string;
    updatedAt: string;
  }): Promise<LibraryCommandResult> {
    return executeSafeWriteTransaction(
      [db.books, db.libraryFolders],
      async () => {
        const book = await db.books.get(bookId);
        if (!book) return { status: "book_not_found" } as const;
        if (folderId && !(await db.libraryFolders.get(folderId))) {
          return { status: "folder_not_found" } as const;
        }
        await db.books.update(bookId, { sourceFolderId: folderId, updatedAt });
        const updated = await db.books.get(bookId);
        assertMutation(updated?.sourceFolderId === folderId);
        return { status: "applied", folderId } as const;
      },
    );
  }

  createFolderAndMoveAtomic({
    bookId,
    folder,
    updatedAt,
  }: Parameters<LibraryCommandPort["createFolderAndMoveAtomic"]>[0]) {
    return executeSafeWriteTransaction(
      [db.books, db.libraryFolders],
      async () => {
        if (!(await db.books.get(bookId))) {
          return { status: "book_not_found" } as const;
        }
        await db.libraryFolders.add(folder);
        await db.books.update(bookId, {
          sourceFolderId: folder.id,
          updatedAt,
        });
        const [savedFolder, updatedBook] = await Promise.all([
          db.libraryFolders.get(folder.id),
          db.books.get(bookId),
        ]);
        assertMutation(
          savedFolder?.id === folder.id &&
            updatedBook?.sourceFolderId === folder.id,
        );
        return { status: "applied", folderId: folder.id } as const;
      },
    );
  }

  dissolveFolderAtomic({
    folderId,
    updatedAt,
  }: Parameters<LibraryCommandPort["dissolveFolderAtomic"]>[0]) {
    return executeSafeWriteTransaction(
      [db.books, db.libraryFolders, db.indexedNovelFiles],
      async () => {
        const folder = await db.libraryFolders.get(folderId);
        if (!folder) {
          return { status: "folder_not_found" } as const;
        }
        const [childFolderCount, indexedFileCount] = await Promise.all([
          db.libraryFolders.where("parentId").equals(folderId).count(),
          db.indexedNovelFiles.where("parentFolderId").equals(folderId).count(),
        ]);
        if (
          folder.sourceType !== "virtual" ||
          childFolderCount > 0 ||
          indexedFileCount > 0
        ) {
          return { status: "folder_not_dissolvable" } as const;
        }
        const affectedBookCount = await db.books
          .where("sourceFolderId")
          .equals(folderId)
          .modify({ sourceFolderId: undefined, updatedAt });
        await db.libraryFolders.delete(folderId);
        const [
          remainingAssignments,
          remainingFolder,
          remainingChildren,
          remainingIndexedFiles,
        ] = await Promise.all([
          db.books.where("sourceFolderId").equals(folderId).count(),
          db.libraryFolders.get(folderId),
          db.libraryFolders.where("parentId").equals(folderId).count(),
          db.indexedNovelFiles.where("parentFolderId").equals(folderId).count(),
        ]);
        assertMutation(
          remainingAssignments === 0 &&
            !remainingFolder &&
            remainingChildren === 0 &&
            remainingIndexedFiles === 0,
        );
        return { status: "applied", affectedBookCount } as const;
      },
    );
  }

  removeBookAtomic({
    bookId,
    updatedAt,
  }: Parameters<LibraryCommandPort["removeBookAtomic"]>[0]) {
    return executeSafeWriteTransaction(
      [
        db.books,
        db.chapters,
        db.progress,
        db.bookmarks,
        db.aiViews,
        db.txtChapterIndices,
        db.indexedNovelFiles,
      ],
      async () => {
        if (!(await db.books.get(bookId))) {
          return { status: "book_not_found" } as const;
        }
        await Promise.all([
          db.chapters.where("bookId").equals(bookId).delete(),
          db.progress.where("bookId").equals(bookId).delete(),
          db.bookmarks.where("bookId").equals(bookId).delete(),
          db.aiViews.where("bookId").equals(bookId).delete(),
          db.txtChapterIndices.where("bookId").equals(bookId).delete(),
          db.indexedNovelFiles.where("bookId").equals(bookId).modify({
            bookId: undefined,
            status: "indexed",
            updatedAt,
          }),
        ]);
        await db.books.delete(bookId);
        const [
          book,
          chapters,
          progress,
          bookmarks,
          aiViews,
          chapterIndices,
          indexedFileLinks,
        ] = await Promise.all([
          db.books.get(bookId),
          db.chapters.where("bookId").equals(bookId).count(),
          db.progress.where("bookId").equals(bookId).count(),
          db.bookmarks.where("bookId").equals(bookId).count(),
          db.aiViews.where("bookId").equals(bookId).count(),
          db.txtChapterIndices.where("bookId").equals(bookId).count(),
          db.indexedNovelFiles.where("bookId").equals(bookId).count(),
        ]);
        assertMutation(
          !book &&
            chapters === 0 &&
            progress === 0 &&
            bookmarks === 0 &&
            aiViews === 0 &&
            chapterIndices === 0 &&
            indexedFileLinks === 0,
        );
        return { status: "applied", affectedBookCount: 1 } as const;
      },
      {
        acknowledgeEmptyShelfOnCommit: (result) =>
          result.status === "applied",
      },
    );
  }

  offloadBookAtomic({
    bookId,
    updatedAt,
  }: Parameters<LibraryCommandPort["offloadBookAtomic"]>[0]) {
    return executeSafeWriteTransaction([db.books, db.chapters], async () => {
      if (!(await db.books.get(bookId))) {
        return { status: "book_not_found" } as const;
      }
      await db.chapters.where("bookId").equals(bookId).delete();
      await db.books.update(bookId, {
        cacheStatus: "metadata_only",
        sourceAvailability: "cloud_available",
        updatedAt,
      });
      const [updatedBook, remainingChapters] = await Promise.all([
        db.books.get(bookId),
        db.chapters.where("bookId").equals(bookId).count(),
      ]);
      assertMutation(
        remainingChapters === 0 &&
          updatedBook?.cacheStatus === "metadata_only" &&
          updatedBook.sourceAvailability === "cloud_available",
      );
      return { status: "applied", affectedBookCount: 1 } as const;
    });
  }
}

export const libraryCommandService = new LibraryCommandService(
  new DexieLibraryCommandPort(),
  { createId, now: () => new Date().toISOString() },
);
