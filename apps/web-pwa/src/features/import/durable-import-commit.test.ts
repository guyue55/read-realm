import { describe, expect, it, vi } from "vitest";
import {
  createImportTaskDraft,
  transitionImportTask,
  type DurableImportTask,
} from "@reader/storage-core";
import type { Book, LocalChapter } from "@reader/shared-types";

import { commitDurableImportResult } from "./durable-import-commit";

const now = "2026-08-13T12:20:00+08:00";

function previewTask(): DurableImportTask {
  const draft = createImportTaskDraft({
    id: "task-1",
    filename: "novel.txt",
    format: "txt",
    sourceKind: "file",
    size: 64,
    now,
  });
  const reading = transitionImportTask(draft, { type: "reading", at: now });
  const parsing = transitionImportTask(reading, {
    type: "parsing",
    at: now,
    totalChapters: 1,
  });
  return transitionImportTask({
    ...parsing,
    bookMetadata: { ...parsing.bookMetadata, chapterCount: 1, wordCount: 3 },
    chapters: [{
      id: "chapter-1",
      bookId: parsing.bookMetadata.id,
      index: 0,
      title: "第一章",
      content: "正文。",
    }],
  }, { type: "preview", at: now });
}

function createMemoryPort(failChapterWrite = false) {
  let task = previewTask();
  const books: Book[] = [];
  const chapters: LocalChapter[] = [];
  const events: string[] = [];
  const port = {
    transaction: vi.fn(async (operation: (transaction: {
      getTask(taskId: string): Promise<DurableImportTask | undefined>;
      putTask(value: DurableImportTask): Promise<void>;
      addBook(value: Book): Promise<void>;
      putChapters(values: LocalChapter[]): Promise<void>;
    }) => Promise<void>) => {
      const before = structuredClone({ task, books, chapters });
      try {
        await operation({
          getTask: async () => structuredClone(task),
          putTask: async (value) => {
            events.push(`task:${value.lifecycle.state}`);
            task = structuredClone(value);
          },
          addBook: async (value) => {
            events.push("book");
            books.push(structuredClone(value));
          },
          putChapters: async (values) => {
            events.push("chapters");
            if (failChapterWrite) throw new Error("quota exceeded");
            chapters.push(...structuredClone(values));
          },
        });
      } catch (error) {
        task = before.task;
        books.splice(0, books.length, ...before.books);
        chapters.splice(0, chapters.length, ...before.chapters);
        throw error;
      }
    }),
  };
  return { port, get task() { return task; }, books, chapters, events };
}

describe("durable import commit", () => {
  it("atomically records saving, book, chapters and lightweight completion", async () => {
    const memory = createMemoryPort();

    const bookId = await commitDurableImportResult({
      port: memory.port,
      taskId: "task-1",
      now: () => now,
    });

    expect(bookId).toBe("task-1:book");
    expect(memory.events).toEqual(["task:saving", "book", "chapters", "task:completed"]);
    expect(memory.books).toHaveLength(1);
    expect(memory.chapters).toHaveLength(1);
    expect(memory.task.lifecycle.state).toBe("completed");
    expect(memory.task.chapters).toEqual([]);
  });

  it("rolls every write back when chapter persistence fails", async () => {
    const memory = createMemoryPort(true);

    await expect(commitDurableImportResult({
      port: memory.port,
      taskId: "task-1",
      now: () => now,
    })).rejects.toThrow("quota exceeded");

    expect(memory.task.lifecycle.state).toBe("preview");
    expect(memory.books).toEqual([]);
    expect(memory.chapters).toEqual([]);
  });

  it("retries a failed complete preview without reparsing", async () => {
    const memory = createMemoryPort();
    const failed = transitionImportTask(memory.task, {
      type: "failed",
      at: now,
      errorCode: "BOOK_SAVE_FAILED",
      errorMessage: "quota exceeded",
    });
    await memory.port.transaction(async (transaction) => transaction.putTask(failed));
    memory.events.length = 0;

    await commitDurableImportResult({ port: memory.port, taskId: "task-1", now: () => now });

    expect(memory.events).toEqual(["task:saving", "book", "chapters", "task:completed"]);
    expect(memory.task.lifecycle).toMatchObject({ state: "completed", attempt: 2 });
  });
});
