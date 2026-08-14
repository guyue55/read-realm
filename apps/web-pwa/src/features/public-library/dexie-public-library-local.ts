import { BookSchema, type Book, type LocalChapter } from "@reader/shared-types";
import { db, executeSafeWriteTransaction } from "@reader/storage-core";
import { PublicLibraryJoinService } from "./public-library-join";
import { publicLibraryApiClient } from "./public-library-client";

export const publicLibraryLocalPort = {
  apply(input: { book: Book; chapters: LocalChapter[] }) {
    return executeSafeWriteTransaction([db.books, db.chapters], async () => {
      const [existingBook, existingChapterCount] = await Promise.all([
        db.books.get(input.book.id),
        db.chapters.where("bookId").equals(input.book.id).count(),
      ]);
      if (existingBook || existingChapterCount > 0)
        throw new Error("LOCAL_BOOK_ID_CONFLICT");
      const validatedBook = BookSchema.parse(input.book);
      await db.books.add(validatedBook);
      await db.chapters.bulkAdd(input.chapters);
      const [saved, savedChapters, chapterCount] = await Promise.all([
        db.books.get(input.book.id),
        db.chapters.bulkGet(input.chapters.map((chapter) => chapter.id)),
        db.chapters.where("bookId").equals(input.book.id).count(),
      ]);
      if (
        JSON.stringify(saved) !== JSON.stringify(validatedBook) ||
        chapterCount !== input.chapters.length ||
        savedChapters.length !== input.chapters.length ||
        savedChapters.some(
          (chapter, index) =>
            JSON.stringify(chapter) !== JSON.stringify(input.chapters[index]),
        )
      ) {
        throw new Error("PUBLIC_LIBRARY_LOCAL_READBACK_FAILED");
      }
    });
  },
};

export const publicLibraryJoinService = new PublicLibraryJoinService(
  publicLibraryApiClient,
  publicLibraryLocalPort,
);
