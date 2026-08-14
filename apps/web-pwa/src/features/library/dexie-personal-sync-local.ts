import type { Book, LocalChapter, ReadingProgress } from "@reader/shared-types";
import { db } from "@reader/storage-core";

export class PersonalSyncLocalError extends Error {
  constructor(
    message: string,
    readonly code = "invalid_download_bundle",
  ) {
    super(message);
    this.name = "PersonalSyncLocalError";
  }
}

export interface DownloadedPersonalBookBundle {
  book: Book;
  chapters: readonly LocalChapter[];
  progress?: ReadingProgress;
}

export type DownloadedBookApplyResult = "applied" | "already_local";

function sameChapterSnapshot(
  current: readonly LocalChapter[],
  expected: readonly LocalChapter[],
) {
  return (
    current.length === expected.length &&
    current.every((chapter, index) => {
      const candidate = expected[index];
      return (
        candidate?.id === chapter.id &&
        candidate.bookId === chapter.bookId &&
        candidate.index === chapter.index &&
        candidate.title === chapter.title &&
        candidate.content === chapter.content
      );
    })
  );
}

function assertCompleteBundle({
  book,
  chapters,
  progress,
}: DownloadedPersonalBookBundle, errorCode = "invalid_download_bundle") {
  if (
    !Number.isInteger(book.chapterCount) ||
    book.chapterCount <= 0 ||
    chapters.length !== book.chapterCount
  ) {
    throw new PersonalSyncLocalError("正文与书目章节数不一致", errorCode);
  }
  const chapterIds = new Set<string>();
  for (const [position, chapter] of chapters.entries()) {
    if (
      chapter.bookId !== book.id ||
      chapter.index !== position ||
      !chapter.content ||
      chapterIds.has(chapter.id)
    ) {
      throw new PersonalSyncLocalError("正文不完整或不属于目标书籍", errorCode);
    }
    chapterIds.add(chapter.id);
  }
  if (progress) {
    const progressChapter = chapters[progress.chapterIndex];
    if (
      progress.bookId !== book.id ||
      !progressChapter ||
      progressChapter.id !== progress.chapterId
    ) {
      throw new PersonalSyncLocalError("阅读进度与目标书籍不匹配", errorCode);
    }
  }
}

export class DexiePersonalSyncLocalStore {
  async readUploadBundle(bookId: string): Promise<DownloadedPersonalBookBundle> {
    return db.transaction(
      "r",
      [db.books, db.chapters, db.progress],
      async () => {
        const [book, chapters, progress] = await Promise.all([
          db.books.get(bookId),
          db.chapters.where("bookId").equals(bookId).sortBy("index"),
          db.progress.get(bookId),
        ]);
        if (!book) {
          throw new PersonalSyncLocalError(
            "待上传书籍不存在",
            "local_book_not_found",
          );
        }
        const bundle = { book, chapters, progress };
        assertCompleteBundle(bundle, "invalid_local_upload");
        return bundle;
      },
    );
  }

  async offloadIfSnapshotMatches(
    expected: DownloadedPersonalBookBundle,
  ): Promise<void> {
    await db.transaction("rw", [db.books, db.chapters], async () => {
      const [book, chapters] = await Promise.all([
        db.books.get(expected.book.id),
        db.chapters.where("bookId").equals(expected.book.id).sortBy("index"),
      ]);
      if (
        !book ||
        book.chapterCount !== expected.book.chapterCount ||
        !sameChapterSnapshot(chapters, expected.chapters)
      ) {
        throw new PersonalSyncLocalError(
          "本地正文在云端核验后已发生变化",
          "local_copy_changed_after_verification",
        );
      }
      await db.chapters.where("bookId").equals(expected.book.id).delete();
      await db.books.update(expected.book.id, {
        cacheStatus: "metadata_only",
        sourceAvailability: "cloud_available",
        updatedAt: new Date().toISOString(),
      });
      const [updatedBook, remainingChapters] = await Promise.all([
        db.books.get(expected.book.id),
        db.chapters.where("bookId").equals(expected.book.id).count(),
      ]);
      if (
        remainingChapters !== 0 ||
        updatedBook?.cacheStatus !== "metadata_only" ||
        updatedBook.sourceAvailability !== "cloud_available"
      ) {
        throw new PersonalSyncLocalError(
          "本地空间释放未完整落盘",
          "local_write_failed",
        );
      }
    });
  }

  async applyDownloadedBook(
    bundle: DownloadedPersonalBookBundle,
  ): Promise<DownloadedBookApplyResult> {
    assertCompleteBundle(bundle);
    const { book, chapters, progress } = bundle;
    const storedBook: Book = {
      ...book,
      cacheStatus: "chapters_full",
      sourceAvailability: "full_cached",
    };

    return db.transaction("rw", [db.books, db.chapters, db.progress], async () => {
      const [existingBook, existingChapterCount] = await Promise.all([
        db.books.get(book.id),
        db.chapters.where("bookId").equals(book.id).count(),
      ]);
      if (
        existingBook &&
        (existingChapterCount > 0 ||
          existingBook.cacheStatus !== "metadata_only" ||
          existingBook.sourceAvailability === "full_cached")
      ) {
        return "already_local" as const;
      }
      await db.chapters.where("bookId").equals(book.id).delete();
      await db.books.put(storedBook);
      await db.chapters.bulkPut([...chapters]);
      if (progress) await db.progress.put(progress);

      const [savedBook, savedChapterCount, savedProgress] = await Promise.all([
        db.books.get(book.id),
        db.chapters.where("bookId").equals(book.id).count(),
        progress ? db.progress.get(book.id) : Promise.resolve(undefined),
      ]);
      if (
        savedBook?.cacheStatus !== "chapters_full" ||
        savedBook.sourceAvailability !== "full_cached" ||
        savedChapterCount !== chapters.length ||
        (progress && savedProgress?.updatedAt !== progress.updatedAt)
      ) {
        throw new PersonalSyncLocalError("下载数据未完整落盘");
      }
      return "applied" as const;
    });
  }
}

export const personalSyncLocalStore = new DexiePersonalSyncLocalStore();
