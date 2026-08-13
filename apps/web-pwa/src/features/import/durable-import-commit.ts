import {
  transitionImportTask,
  type DurableImportTask,
} from "@reader/storage-core";
import type { Book, LocalChapter } from "@reader/shared-types";

export interface DurableImportCommitTransaction {
  getTask(taskId: string): Promise<DurableImportTask | undefined>;
  putTask(task: DurableImportTask): Promise<void>;
  addBook(book: Book): Promise<void>;
  putChapters(chapters: LocalChapter[]): Promise<void>;
}

export interface DurableImportCommitPort {
  transaction(
    operation: (transaction: DurableImportCommitTransaction) => Promise<void>,
  ): Promise<void>;
}

export interface CommitDurableImportResultOptions {
  port: DurableImportCommitPort;
  taskId: string;
  now?: () => string;
  editBook?: (book: Book) => Book;
  editChapters?: (chapters: LocalChapter[]) => LocalChapter[];
}

export async function commitDurableImportResult({
  port,
  taskId,
  now = () => new Date().toISOString(),
  editBook = (book) => book,
  editChapters = (chapters) => chapters,
}: CommitDurableImportResultOptions) {
  let committedBookId = "";
  await port.transaction(async (transaction) => {
    const stored = await transaction.getTask(taskId);
    if (!stored) throw new Error(`DURABLE_IMPORT_TASK_READBACK_MISSING:${taskId}`);
    const preview = stored.lifecycle.state === "failed"
      ? transitionImportTask(stored, { type: "retry", at: now() })
      : stored;
    if (preview.lifecycle.state !== "preview") {
      throw new Error(`DURABLE_IMPORT_COMMIT_FORBIDDEN:${preview.lifecycle.state}`);
    }

    const book = editBook(preview.bookMetadata);
    const chapters = editChapters(preview.chapters);
    if (
      chapters.length === 0 ||
      book.id !== preview.bookMetadata.id ||
      book.chapterCount !== chapters.length ||
      chapters.some(
        (chapter, index) => chapter.bookId !== book.id || chapter.index !== index,
      )
    ) {
      throw new Error("DURABLE_IMPORT_COMMIT_RESULT_INVALID");
    }

    const saving = transitionImportTask({
      ...preview,
      bookMetadata: book,
      chapters,
    }, { type: "saving", at: now() });
    await transaction.putTask(saving);
    await transaction.addBook(book);
    await transaction.putChapters(chapters);
    await transaction.putTask(
      transitionImportTask(saving, { type: "completed", at: now() }),
    );
    committedBookId = book.id;
  });
  return committedBookId;
}
