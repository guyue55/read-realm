import { BookSchema, type Book, type LocalChapter } from "@reader/shared-types";
import { db, executeSafeWriteTransaction } from "@reader/storage-core";
import { PublicLibraryJoinService } from "./public-library-join";
import {
  publicLibraryApiClient,
  type PublicLibraryBook,
} from "./public-library-client";

function isBookMatching(saved: Book | undefined, target: Book): boolean {
  if (!saved) return false;
  return (
    saved.id === target.id &&
    saved.title === target.title &&
    (saved.author ?? "") === (target.author ?? "") &&
    (saved.description ?? "") === (target.description ?? "") &&
    saved.sourceType === target.sourceType &&
    saved.format === target.format &&
    saved.status === target.status &&
    saved.chapterCount === target.chapterCount &&
    saved.wordCount === target.wordCount &&
    saved.cacheStatus === target.cacheStatus &&
    saved.sourceAvailability === target.sourceAvailability &&
    saved.createdAt === target.createdAt &&
    saved.updatedAt === target.updatedAt
  );
}

function isChapterMatching(
  saved: LocalChapter | undefined,
  target: LocalChapter,
): boolean {
  if (!saved) return false;
  return (
    saved.id === target.id &&
    saved.bookId === target.bookId &&
    saved.index === target.index &&
    saved.title === target.title &&
    saved.content === target.content
  );
}

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

      const isBookOk = isBookMatching(saved, validatedBook);
      const isCountOk =
        chapterCount === input.chapters.length &&
        savedChapters.length === input.chapters.length;
      const isChaptersOk = savedChapters.every((chapter, index) =>
        isChapterMatching(chapter, input.chapters[index]),
      );

      if (!isBookOk || !isCountOk || !isChaptersOk) {
        throw new Error("PUBLIC_LIBRARY_LOCAL_READBACK_FAILED");
      }
    });
  },
};

export const publicLibraryJoinService = new PublicLibraryJoinService(
  publicLibraryApiClient,
  publicLibraryLocalPort,
);

/**
 * 公共典籍在本地书架的状态与阅读进度
 */
export interface PublicBookLocalState {
  localBook: Book | undefined;
  progress:
    | {
        chapterIndex: number;
        percentage: number;
        chapterTitle?: string;
        updatedAt?: string;
      }
    | undefined;
}

export type PublicBookMatchCriteria = Pick<PublicLibraryBook, "title"> &
  Partial<Pick<PublicLibraryBook, "author" | "chapterCount">>;

/**
 * 检查公共藏书是否已经在用户本地书架中
 */
export async function findLocalBookForPublicBook(
  publicBook: PublicBookMatchCriteria,
): Promise<Book | undefined> {
  const books = await db.books.toArray();
  return books.find(
    (b) =>
      b.title === publicBook.title &&
      (b.author || "") === (publicBook.author || "") &&
      (publicBook.chapterCount === undefined ||
        b.chapterCount === publicBook.chapterCount),
  );
}

/**
 * 获取单本公共藏书在本地的书架与阅读进度状态
 */
export async function getLocalStateForPublicBook(
  publicBook: PublicBookMatchCriteria,
): Promise<PublicBookLocalState> {
  const localBook = await findLocalBookForPublicBook(publicBook);
  if (!localBook) {
    return { localBook: undefined, progress: undefined };
  }
  const progressRecord = await db.progress.get(localBook.id);
  return {
    localBook,
    progress: progressRecord
      ? {
          chapterIndex: progressRecord.chapterIndex,
          percentage: progressRecord.percentage,
          updatedAt: progressRecord.updatedAt,
        }
      : undefined,
  };
}

/**
 * 批量获取多本公共藏书在本地的书架与阅读进度状态（高性能单次查询）
 */
export async function getBatchLocalStatesForPublicBooks(
  publicBooks: PublicLibraryBook[],
): Promise<Map<string, PublicBookLocalState>> {
  const result = new Map<string, PublicBookLocalState>();
  if (!publicBooks.length) return result;

  const [allLocalBooks, allProgress] = await Promise.all([
    db.books.toArray(),
    db.progress.toArray(),
  ]);

  const progressMap = new Map(allProgress.map((p) => [p.bookId, p]));

  for (const pb of publicBooks) {
    const matchedBook = allLocalBooks.find(
      (b) =>
        b.title === pb.title &&
        (b.author || "") === (pb.author || "") &&
        b.chapterCount === pb.chapterCount,
    );

    if (matchedBook) {
      const p = progressMap.get(matchedBook.id);
      result.set(pb.id, {
        localBook: matchedBook,
        progress: p
          ? {
              chapterIndex: p.chapterIndex,
              percentage: p.percentage,
              updatedAt: p.updatedAt,
            }
          : undefined,
      });
    } else {
      result.set(pb.id, {
        localBook: undefined,
        progress: undefined,
      });
    }
  }

  return result;
}
