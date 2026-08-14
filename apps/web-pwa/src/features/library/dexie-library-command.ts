import { BookSchema, createId, type Book, type LocalChapter } from "@reader/shared-types";
import { db, executeSafeWriteTransaction } from "@reader/storage-core";
import {
  LibraryCommandService,
  type LibraryCommandPort,
  type LibraryCommandResult,
} from "./library-command-service";

function assertMutation(condition: boolean) {
  if (!condition) throw new Error("LIBRARY_COMMAND_READBACK_FAILED");
}

function hasCompleteBody(book: Book, chapters: readonly LocalChapter[]) {
  if (book.chapterCount <= 0 || chapters.length !== book.chapterCount) return false;
  const ids = new Set<string>();
  return chapters.every((chapter, index) => {
    if (
      chapter.bookId !== book.id ||
      chapter.index !== index ||
      chapter.content.length === 0 ||
      ids.has(chapter.id)
    ) {
      return false;
    }
    ids.add(chapter.id);
    return true;
  });
}

function disconnectedBook(book: Book, updatedAt: string): Book {
  const candidate: Book = {
    ...book,
    sourceType: "manual",
    sourceFileId: undefined,
    contentLocator: undefined,
    multiFileBook: undefined,
    cacheStatus: "chapters_full",
    sourceAvailability: "full_cached",
    updatedAt,
  };
  return BookSchema.parse(candidate);
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

  disconnectBookAtomic({
    bookId,
    updatedAt,
  }: Parameters<LibraryCommandPort["disconnectBookAtomic"]>[0]) {
    return executeSafeWriteTransaction(
      [db.books, db.chapters, db.indexedNovelFiles],
      async () => {
      const [book, chapters] = await Promise.all([
        db.books.get(bookId),
        db.chapters.where("bookId").equals(bookId).sortBy("index"),
      ]);
      if (!book) return { status: "book_not_found" } as const;
      if (!book.contentLocator && !book.sourceFileId && !book.multiFileBook) {
        return { status: "book_not_source_bound" } as const;
      }
      if (!hasCompleteBody(book, chapters)) {
        return { status: "book_not_fully_cached" } as const;
      }
      const candidate = disconnectedBook(book, updatedAt);
      await db.books.put(candidate);
      await db.indexedNovelFiles.where("bookId").equals(bookId).modify({
        bookId: undefined,
        status: "indexed",
        updatedAt,
      });
      const saved = await db.books.get(bookId);
      assertMutation(
        BookSchema.safeParse(saved).success &&
          saved?.sourceType === "manual" &&
          !saved.contentLocator &&
          (await db.chapters.where("bookId").equals(bookId).count()) ===
            book.chapterCount &&
          (await db.indexedNovelFiles.where("bookId").equals(bookId).count()) === 0,
      );
      return { status: "applied", affectedBookCount: 1 } as const;
      },
    );
  }

  disconnectFolderAtomic({
    folderId,
    updatedAt,
  }: Parameters<LibraryCommandPort["disconnectFolderAtomic"]>[0]) {
    return executeSafeWriteTransaction(
      [db.libraryFolders, db.books, db.chapters, db.indexedNovelFiles],
      async () => {
        const folder = await db.libraryFolders.get(folderId);
        if (!folder) return { status: "folder_not_found" } as const;
        if (!folder.sourceId || folder.sourceType === "virtual") {
          return { status: "folder_not_source_bound" } as const;
        }
        const assigned = await db.books
          .where("sourceFolderId")
          .equals(folderId)
          .toArray();
        const sourceBacked = assigned.filter(
          (book) =>
            book.sourceType === "folder_index" ||
            book.sourceType === "folder_multi_file_book" ||
            book.sourceType === "local_backend_directory",
        );
        if (
          sourceBacked.some(
            (book) => book.contentLocator?.sourceId !== folder.sourceId,
          )
        ) {
          return { status: "folder_contains_ambiguous_sources" } as const;
        }
        const physicalBooks = assigned.filter(
          (book) => book.contentLocator?.sourceId === folder.sourceId,
        );
        const chapterSets = await Promise.all(
          physicalBooks.map((book) =>
            db.chapters.where("bookId").equals(book.id).sortBy("index"),
          ),
        );
        if (
          physicalBooks.some(
            (book, index) => !hasCompleteBody(book, chapterSets[index] ?? []),
          )
        ) {
          return { status: "folder_contains_incomplete_books" } as const;
        }
        const candidates = physicalBooks.map((book) =>
          disconnectedBook(book, updatedAt),
        );
        await db.books.bulkPut(candidates);
        const physicalBookIds = physicalBooks.map((book) => book.id);
        if (physicalBookIds.length > 0) {
          await db.indexedNovelFiles
            .where("bookId")
            .anyOf(physicalBookIds)
            .modify({ bookId: undefined, status: "indexed", updatedAt });
        }
        await db.libraryFolders.update(folderId, {
          sourceId: undefined,
          sourceType: "virtual",
          updatedAt,
        });
        const [savedFolder, savedBooks] = await Promise.all([
          db.libraryFolders.get(folderId),
          Promise.all(physicalBooks.map((book) => db.books.get(book.id))),
        ]);
        assertMutation(
          savedFolder?.sourceType === "virtual" &&
            !savedFolder.sourceId &&
            savedBooks.every(
              (book) =>
                BookSchema.safeParse(book).success &&
                book?.sourceType === "manual" &&
                !book.contentLocator,
            ) &&
            (physicalBookIds.length === 0 ||
              (await db.indexedNovelFiles
                .where("bookId")
                .anyOf(physicalBookIds)
                .count()) === 0),
        );
        return {
          status: "applied",
          affectedBookCount: physicalBooks.length,
          folderId,
        } as const;
      },
    );
  }

  async requestReconstruct({
    bookId,
  }: Parameters<LibraryCommandPort["requestReconstruct"]>[0]) {
    if (!(await db.books.get(bookId))) {
      return { status: "book_not_found" } as const;
    }
    return { status: "reconstruct_requires_reimport" } as const;
  }
}

export const libraryCommandService = new LibraryCommandService(
  new DexieLibraryCommandPort(),
  { createId, now: () => new Date().toISOString() },
);
