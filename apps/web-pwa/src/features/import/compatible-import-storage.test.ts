import type { ImportTask } from "@reader/storage-core";
import { describe, expect, it, vi } from "vitest";
import {
  buildCompatibleImportTask,
  persistCompatibleImportTask,
} from "./compatible-import-storage";

function task(): ImportTask {
  return {
    id: "task-epub",
    bookMetadata: {
      id: "book-epub",
      title: "固定 EPUB",
      sourceType: "upload",
      format: "epub",
      status: "to_read",
      tags: [],
      chapterCount: 2,
      wordCount: 12,
      createdAt: "2026-08-13T07:00:00+08:00",
      updatedAt: "2026-08-13T07:00:00+08:00",
    },
    chapters: [
      {
        id: "chapter-1",
        bookId: "book-epub",
        index: 0,
        title: "第一章",
        content: "<p>清晨，林舟。</p>",
      },
      {
        id: "chapter-2",
        bookId: "book-epub",
        index: 1,
        title: "第二章",
        content: "<p>傍晚，林舟。</p>",
      },
    ],
    createdAt: "2026-08-13T07:00:00+08:00",
  };
}

describe("compatible import storage", () => {
  it("builds a deterministic complete EPUB task", () => {
    const ids = ["task", "book", "chapter-1", "chapter-2"];
    const built = buildCompatibleImportTask({
      parsedBook: {
        title: "固定 EPUB",
        chapters: [
          { index: 0, title: "第一章", content: "清晨。" },
          { index: 1, title: "第二章", content: "傍晚。" },
        ],
      },
      format: "epub",
      createId: () => ids.shift() ?? "unexpected",
      now: () => "2026-08-13T07:00:00+08:00",
    });

    expect(built.id).toBe("task");
    expect(built.bookMetadata).toMatchObject({
      id: "book",
      format: "epub",
      chapterCount: 2,
      wordCount: 6,
    });
    expect(built.chapters.map((chapter) => chapter.id)).toEqual([
      "chapter-1",
      "chapter-2",
    ]);
  });

  it("can build into identifiers reserved by a durable draft", () => {
    const built = buildCompatibleImportTask({
      parsedBook: {
        title: "固定 EPUB",
        chapters: [{ index: 0, title: "第一章", content: "清晨。" }],
      },
      format: "epub",
      taskId: "durable-task",
      bookId: "durable-task:book",
      createId: () => "chapter-1",
      now: () => "2026-08-13T07:00:00+08:00",
    });

    expect(built.id).toBe("durable-task");
    expect(built.bookMetadata.id).toBe("durable-task:book");
  });

  it("writes once and verifies an exact readback", async () => {
    const value = task();
    const port = {
      put: vi.fn(async () => undefined),
      get: vi.fn(async () => structuredClone(value)),
      remove: vi.fn(async () => undefined),
    };

    await expect(persistCompatibleImportTask(port, value)).resolves.toBe(value.id);
    expect(port.put).toHaveBeenCalledOnce();
    expect(port.get).toHaveBeenCalledWith(value.id);
    expect(port.remove).not.toHaveBeenCalled();
  });

  it("does not compensate when the initial write fails", async () => {
    const port = {
      put: vi.fn(async () => {
        throw new Error("quota");
      }),
      get: vi.fn(),
      remove: vi.fn(),
    };

    await expect(persistCompatibleImportTask(port, task())).rejects.toThrow(
      "COMPATIBLE_IMPORT_WRITE_FAILED:quota",
    );
    expect(port.get).not.toHaveBeenCalled();
    expect(port.remove).not.toHaveBeenCalled();
  });

  it("removes a task whose readback differs", async () => {
    const value = task();
    const port = {
      put: vi.fn(async () => undefined),
      get: vi.fn(async () => ({
        ...value,
        chapters: value.chapters.slice(0, 1),
      })),
      remove: vi.fn(async () => undefined),
    };

    await expect(persistCompatibleImportTask(port, value)).rejects.toThrow(
      "COMPATIBLE_IMPORT_READBACK_MISMATCH",
    );
    expect(port.remove).toHaveBeenCalledWith(value.id);
  });

  it("removes a task when readback itself fails", async () => {
    const value = task();
    const port = {
      put: vi.fn(async () => undefined),
      get: vi.fn(async () => {
        throw new Error("read failed");
      }),
      remove: vi.fn(async () => undefined),
    };

    await expect(persistCompatibleImportTask(port, value)).rejects.toThrow(
      "COMPATIBLE_IMPORT_READBACK_FAILED:read failed",
    );
    expect(port.remove).toHaveBeenCalledWith(value.id);
  });

  it("preserves both verification and compensation failures", async () => {
    const value = task();
    const port = {
      put: vi.fn(async () => undefined),
      get: vi.fn(async () => undefined),
      remove: vi.fn(async () => {
        throw new Error("delete failed");
      }),
    };

    await expect(persistCompatibleImportTask(port, value)).rejects.toThrow(
      "COMPATIBLE_IMPORT_COMPENSATION_FAILED:COMPATIBLE_IMPORT_READBACK_MISSING:delete failed",
    );
  });
});
