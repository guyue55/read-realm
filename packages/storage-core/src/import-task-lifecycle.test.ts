import { describe, expect, it } from "vitest";

import {
  createImportTaskDraft,
  transitionImportTask,
  type DurableImportTask,
} from "./import-task-lifecycle";

const now = "2026-08-13T11:10:00+08:00";

function draft(): DurableImportTask {
  return createImportTaskDraft({
    id: "task-1",
    filename: "novel.txt",
    format: "txt",
    sourceKind: "file",
    size: 1024,
    now,
  });
}

describe("durable import task lifecycle", () => {
  it("creates a recoverable queued draft before reading bytes", () => {
    expect(draft()).toMatchObject({
      id: "task-1",
      lifecycle: {
        state: "queued",
        attempt: 1,
        canRetry: false,
        source: { kind: "file", filename: "novel.txt", format: "txt", size: 1024 },
        progress: { receivedChapters: 0, totalChapters: null },
      },
      chapters: [],
      createdAt: now,
      updatedAt: now,
    });
  });

  it("moves through reading, parsing and preview while preserving the draft", () => {
    const reading = transitionImportTask(draft(), { type: "reading", at: now });
    const parsing = transitionImportTask(reading, {
      type: "parsing",
      at: now,
      totalChapters: 2,
    });
    const progress = transitionImportTask(parsing, {
      type: "progress",
      at: now,
      receivedChapters: 1,
    });
    const preview = transitionImportTask(progress, { type: "preview", at: now });

    expect(preview.lifecycle).toMatchObject({
      state: "preview",
      canRetry: false,
      progress: { receivedChapters: 1, totalChapters: 2 },
    });
  });

  it("keeps failures retryable and increments the attempt on retry", () => {
    const parsing = transitionImportTask(
      transitionImportTask(draft(), { type: "reading", at: now }),
      { type: "parsing", at: now, totalChapters: 2 },
    );
    const failed = transitionImportTask(parsing, {
      type: "failed",
      at: now,
      errorCode: "CHAPTER_PARSE_FAILED",
      errorMessage: "编码无法识别",
    });
    const retried = transitionImportTask(failed, { type: "retry", at: now });

    expect(failed.lifecycle).toMatchObject({
      state: "failed",
      canRetry: true,
      errorCode: "CHAPTER_PARSE_FAILED",
      errorMessage: "编码无法识别",
    });
    expect(retried.lifecycle).toMatchObject({ state: "queued", attempt: 2, canRetry: false });
    expect(retried.chapters).toEqual([]);
    expect(retried.bookMetadata).toMatchObject({ chapterCount: 0, wordCount: 0 });
  });

  it("returns a failed complete preview to preview without discarding parsed chapters", () => {
    const parsing = transitionImportTask(
      transitionImportTask(draft(), { type: "reading", at: now }),
      { type: "parsing", at: now, totalChapters: 1 },
    );
    const withResult: DurableImportTask = {
      ...parsing,
      bookMetadata: { ...parsing.bookMetadata, chapterCount: 1, wordCount: 3 },
      chapters: [{
        id: "chapter-1",
        bookId: parsing.bookMetadata.id,
        index: 0,
        title: "第一章",
        content: "正文。",
      }],
    };
    const preview = transitionImportTask(withResult, { type: "preview", at: now });
    const failed = transitionImportTask(preview, {
      type: "failed",
      at: now,
      errorCode: "BOOK_SAVE_FAILED",
      errorMessage: "空间不足",
    });
    const retried = transitionImportTask(failed, { type: "retry", at: now });

    expect(retried.lifecycle).toMatchObject({ state: "preview", attempt: 2 });
    expect(retried.chapters).toHaveLength(1);
    expect(retried.bookMetadata.chapterCount).toBe(1);
  });

  it("retains only lightweight task history after a completed save", () => {
    const parsing = transitionImportTask(
      transitionImportTask(draft(), { type: "reading", at: now }),
      { type: "parsing", at: now, totalChapters: 1 },
    );
    const withResult: DurableImportTask = {
      ...parsing,
      bookMetadata: { ...parsing.bookMetadata, chapterCount: 1, wordCount: 3 },
      chapters: [{ id: "chapter-1", bookId: parsing.bookMetadata.id, index: 0, title: "第一章", content: "正文。" }],
    };
    const preview = transitionImportTask(withResult, { type: "preview", at: now });
    const saving = transitionImportTask(preview, { type: "saving", at: now });
    const completed = transitionImportTask(saving, { type: "completed", at: now });

    expect(completed.lifecycle.state).toBe("completed");
    expect(completed.chapters).toEqual([]);
    expect(completed.bookMetadata.chapterCount).toBe(1);
  });

  it("preserves cancelled drafts without offering an implicit retry", () => {
    const cancelled = transitionImportTask(draft(), {
      type: "cancelled",
      at: now,
      reason: "用户取消",
    });
    expect(cancelled.lifecycle).toMatchObject({
      state: "cancelled",
      canRetry: false,
      errorMessage: "用户取消",
    });
    expect(() => transitionImportTask(cancelled, { type: "retry", at: now }))
      .toThrow("IMPORT_TASK_TRANSITION_FORBIDDEN:cancelled:retry");
  });

  it("allows a user to abandon a completed folder preview explicitly", () => {
    const queued = createImportTaskDraft({
      id: "folder-task",
      filename: "本地书库",
      format: "unknown",
      sourceKind: "folder",
      now,
    });
    const preview = transitionImportTask(
      transitionImportTask(
        transitionImportTask(queued, { type: "reading", at: now }),
        { type: "parsing", at: now, totalChapters: null },
      ),
      { type: "preview", at: now },
    );
    const cancelled = transitionImportTask(preview, {
      type: "cancelled",
      at: now,
      reason: "用户放弃目录预览",
    });

    expect(cancelled.lifecycle).toMatchObject({
      state: "cancelled",
      canRetry: false,
      errorCode: "TASK_CANCELLED",
    });
  });

  it("rejects illegal state jumps instead of fabricating success", () => {
    expect(() => transitionImportTask(draft(), { type: "preview", at: now }))
      .toThrow("IMPORT_TASK_TRANSITION_FORBIDDEN:queued:preview");
  });

  it("tracks a folder scan independently from chapter parsing and retries a completed scan", () => {
    const queued = createImportTaskDraft({
      id: "folder-task",
      filename: "本地书库",
      format: "unknown",
      sourceKind: "folder",
      now,
    });
    const scanning = transitionImportTask(
      transitionImportTask(queued, { type: "reading", at: now }),
      { type: "parsing", at: now, totalChapters: null },
    );
    const progressed = transitionImportTask(scanning, {
      type: "scanProgress",
      at: now,
      scannedFiles: 8,
      scannedDirectories: 3,
    });
    const preview = transitionImportTask(progressed, { type: "preview", at: now });
    const failed = transitionImportTask(preview, {
      type: "failed",
      at: now,
      errorCode: "FOLDER_COMMIT_FAILED",
      errorMessage: "配额不足",
    });
    const retried = transitionImportTask(failed, { type: "retry", at: now });

    expect(preview.lifecycle).toMatchObject({
      state: "preview",
      progress: { scannedFiles: 8, scannedDirectories: 3, scanCompleted: true },
    });
    expect(retried.lifecycle).toMatchObject({ state: "preview", attempt: 2 });
  });

  it("rejects decreasing folder scan progress", () => {
    const scanning = transitionImportTask(
      transitionImportTask(createImportTaskDraft({
        id: "folder-task",
        filename: "本地书库",
        format: "unknown",
        sourceKind: "folder",
        now,
      }), { type: "reading", at: now }),
      { type: "parsing", at: now, totalChapters: null },
    );
    const progressed = transitionImportTask(scanning, {
      type: "scanProgress",
      at: now,
      scannedFiles: 8,
      scannedDirectories: 3,
    });

    expect(() => transitionImportTask(progressed, {
      type: "scanProgress",
      at: now,
      scannedFiles: 7,
      scannedDirectories: 3,
    })).toThrow("IMPORT_TASK_SCAN_PROGRESS_INVALID");
  });

  it("restarts a failed folder scan after refresh without claiming the lost preview survived", () => {
    const queued = createImportTaskDraft({
      id: "folder-task",
      filename: "本地书库",
      format: "unknown",
      sourceKind: "folder",
      now,
    });
    const preview = transitionImportTask(
      transitionImportTask(
        transitionImportTask(queued, { type: "reading", at: now }),
        { type: "parsing", at: now, totalChapters: null },
      ),
      { type: "preview", at: now },
    );
    const failed = transitionImportTask(preview, {
      type: "failed",
      at: now,
      errorCode: "FOLDER_COMMIT_FAILED",
      errorMessage: "配额不足",
    });
    const restarted = transitionImportTask(failed, { type: "restart", at: now });

    expect(restarted.lifecycle).toMatchObject({
      state: "queued",
      attempt: 2,
      canRetry: false,
      progress: { receivedChapters: 0, totalChapters: null },
    });
    expect(restarted.lifecycle.progress.scanCompleted).toBeUndefined();
  });
});
