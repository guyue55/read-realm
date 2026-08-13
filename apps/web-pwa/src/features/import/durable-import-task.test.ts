import { describe, expect, it, vi } from "vitest";
import { createImportTaskDraft, type DurableImportTask } from "@reader/storage-core";

import { createDurableImportTaskController } from "./durable-import-task";

const now = "2026-08-13T11:25:00+08:00";

function storedDraft(): DurableImportTask {
  return createImportTaskDraft({
    id: "task-1",
    filename: "novel.txt",
    format: "txt",
    sourceKind: "file",
    size: 1024,
    now,
  });
}

describe("durable import task controller", () => {
  it("persists and verifies a queued draft before reading the source", async () => {
    let stored: DurableImportTask | undefined;
    const port = {
      put: vi.fn(async (task: DurableImportTask) => { stored = structuredClone(task); }),
      get: vi.fn(async () => structuredClone(stored)),
    };
    const controller = createDurableImportTaskController({ port, now: () => now });

    const draft = await controller.create({
      id: "task-1",
      filename: "novel.txt",
      format: "txt",
      sourceKind: "file",
      size: 1024,
    });

    expect(draft.lifecycle.state).toBe("queued");
    expect(port.put).toHaveBeenCalledOnce();
    expect(port.get).toHaveBeenCalledWith("task-1");
  });

  it("writes every legal transition and can recover the latest task", async () => {
    let stored = storedDraft();
    const port = {
      put: vi.fn(async (task: DurableImportTask) => { stored = structuredClone(task); }),
      get: vi.fn(async () => structuredClone(stored)),
    };
    const controller = createDurableImportTaskController({ port, now: () => now });

    await controller.transition("task-1", { type: "reading" });
    await controller.transition("task-1", { type: "parsing", totalChapters: 2 });
    await controller.transition("task-1", { type: "progress", receivedChapters: 1 });

    const recovered = await controller.recover("task-1");
    expect(recovered.lifecycle).toMatchObject({
      state: "parsing",
      progress: { receivedChapters: 1, totalChapters: 2 },
    });
  });

  it("keeps a failed draft retryable when parsing fails", async () => {
    let stored = storedDraft();
    const port = {
      put: vi.fn(async (task: DurableImportTask) => { stored = structuredClone(task); }),
      get: vi.fn(async () => structuredClone(stored)),
    };
    const controller = createDurableImportTaskController({ port, now: () => now });
    await controller.transition("task-1", { type: "reading" });
    await controller.transition("task-1", { type: "parsing", totalChapters: null });
    const failed = await controller.transition("task-1", {
      type: "failed",
      errorCode: "CHAPTER_PARSE_FAILED",
      errorMessage: "编码无法识别",
    });

    expect(failed.lifecycle).toMatchObject({ state: "failed", canRetry: true });
    expect((await controller.recover("task-1")).lifecycle.errorMessage).toBe("编码无法识别");
  });

  it("attaches a complete parse result and enters preview atomically", async () => {
    let stored = storedDraft();
    const port = {
      put: vi.fn(async (task: DurableImportTask) => { stored = structuredClone(task); }),
      get: vi.fn(async () => structuredClone(stored)),
    };
    const controller = createDurableImportTaskController({ port, now: () => now });
    await controller.transition("task-1", { type: "reading" });
    await controller.transition("task-1", { type: "parsing", totalChapters: 1 });
    await controller.transition("task-1", { type: "progress", receivedChapters: 1 });

    const preview = await controller.attachParsedResult("task-1", {
      bookMetadata: {
        id: "book-1",
        title: "novel",
        sourceType: "upload",
        format: "txt",
        status: "to_read",
        tags: [],
        chapterCount: 1,
        wordCount: 5,
        createdAt: now,
        updatedAt: now,
      },
      chapters: [{ id: "chapter-1", bookId: "book-1", index: 0, title: "第一章", content: "正文内容" }],
    });

    expect(preview.lifecycle.state).toBe("preview");
    expect(preview.chapters).toHaveLength(1);
    expect(preview.bookMetadata.chapterCount).toBe(1);
    expect((await controller.recover("task-1")).lifecycle.state).toBe("preview");
  });

  it("rejects missing or mismatched readback instead of reporting persistence", async () => {
    const port = {
      put: vi.fn(async () => undefined),
      get: vi.fn(async () => undefined),
    };
    const controller = createDurableImportTaskController({ port, now: () => now });

    await expect(controller.create({
      id: "task-1",
      filename: "novel.txt",
      format: "txt",
      sourceKind: "file",
      size: 1024,
    })).rejects.toThrow("DURABLE_IMPORT_TASK_READBACK_MISSING:task-1");
  });

  it("serializes rapid worker transitions for the same task", async () => {
    let stored = storedDraft();
    const port = {
      put: vi.fn(async (task: DurableImportTask) => {
        await Promise.resolve();
        stored = structuredClone(task);
      }),
      get: vi.fn(async () => structuredClone(stored)),
    };
    const controller = createDurableImportTaskController({ port, now: () => now });

    const reading = controller.transition("task-1", { type: "reading" });
    const parsing = controller.transition("task-1", { type: "parsing", totalChapters: 2 });
    const progress = controller.transition("task-1", { type: "progress", receivedChapters: 2 });

    await expect(Promise.all([reading, parsing, progress])).resolves.toHaveLength(3);
    expect((await controller.recover("task-1")).lifecycle).toMatchObject({
      state: "parsing",
      progress: { receivedChapters: 2, totalChapters: 2 },
    });
  });

  it("turns an interrupted active task into a visible retryable failure", async () => {
    let stored = storedDraft();
    const port = {
      put: vi.fn(async (task: DurableImportTask) => { stored = structuredClone(task); }),
      get: vi.fn(async () => structuredClone(stored)),
    };
    const controller = createDurableImportTaskController({ port, now: () => now });
    await controller.transition("task-1", { type: "reading" });

    const recovered = await controller.markInterrupted("task-1");

    expect(recovered.lifecycle).toMatchObject({
      state: "failed",
      canRetry: true,
      errorCode: "IMPORT_INTERRUPTED",
    });
  });
});
