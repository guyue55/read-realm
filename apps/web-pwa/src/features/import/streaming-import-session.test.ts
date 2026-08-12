import { describe, expect, it, vi } from "vitest";
import { createStreamingImportSession } from "./streaming-import-session";

function createSession() {
  const saveTask = vi.fn(async () => undefined);
  const ids = ["task-1", "book-1", "chapter-1", "chapter-2"];
  const session = createStreamingImportSession({
    filename: "short-novel.txt",
    format: "txt",
    createId: () => ids.shift() ?? "unexpected-id",
    now: () => "2026-08-13T06:30:00+08:00",
    saveTask,
  });
  return { session, saveTask };
}

describe("streaming import session", () => {
  it("atomically saves one complete task after metadata, chunks and finish", async () => {
    const { session, saveTask } = createSession();

    await session.accept({
      type: "METADATA",
      success: true,
      title: "short-novel",
      chapterCount: 2,
    });
    await session.accept({
      type: "CHUNK",
      success: true,
      startIndex: 0,
      chapters: [
        { title: "第一章", content: "清晨，林舟。" },
        { title: "第二章", content: "傍晚，林舟。" },
      ],
      isFinished: true,
    });
    const result = await session.accept({ type: "FINISHED", success: true });

    expect(result).toEqual({ state: "completed", taskId: "task-1" });
    expect(saveTask).toHaveBeenCalledOnce();
    expect(saveTask).toHaveBeenCalledWith({
      id: "task-1",
      bookMetadata: expect.objectContaining({
        id: "book-1",
        title: "short-novel",
        chapterCount: 2,
        wordCount: 12,
      }),
      chapters: [
        expect.objectContaining({ id: "chapter-1", index: 0, title: "第一章" }),
        expect.objectContaining({ id: "chapter-2", index: 1, title: "第二章" }),
      ],
      createdAt: "2026-08-13T06:30:00+08:00",
    });
  });

  it("does not persist an incomplete task", async () => {
    const { session, saveTask } = createSession();
    await session.accept({
      type: "METADATA",
      success: true,
      title: "short-novel",
      chapterCount: 2,
    });
    await session.accept({
      type: "CHUNK",
      success: true,
      startIndex: 1,
      chapters: [{ title: "第二章", content: "傍晚。" }],
      isFinished: true,
    });

    await expect(
      session.accept({ type: "FINISHED", success: true }),
    ).rejects.toThrow("STREAMING_IMPORT_CHAPTERS_INCOMPLETE:1:2");
    expect(saveTask).not.toHaveBeenCalled();
  });

  it("rejects chunks before metadata without writing a draft", async () => {
    const { session, saveTask } = createSession();

    await expect(
      session.accept({
        type: "CHUNK",
        success: true,
        startIndex: 0,
        chapters: [{ title: "第一章", content: "清晨。" }],
        isFinished: true,
      }),
    ).rejects.toThrow("STREAMING_IMPORT_METADATA_REQUIRED");
    expect(saveTask).not.toHaveBeenCalled();
  });

  it("surfaces worker failure and never persists partial data", async () => {
    const { session, saveTask } = createSession();
    await session.accept({
      type: "METADATA",
      success: true,
      title: "short-novel",
      chapterCount: 2,
    });

    await expect(
      session.accept({ success: false, error: "worker crashed" }),
    ).rejects.toThrow("STREAMING_IMPORT_WORKER_FAILED:worker crashed");
    expect(saveTask).not.toHaveBeenCalled();
  });

  it("is idempotent after a completed session", async () => {
    const { session, saveTask } = createSession();
    await session.accept({
      type: "METADATA",
      success: true,
      title: "short-novel",
      chapterCount: 1,
    });
    await session.accept({
      type: "CHUNK",
      success: true,
      startIndex: 0,
      chapters: [{ title: "第一章", content: "清晨。" }],
      isFinished: true,
    });

    const first = await session.accept({ type: "FINISHED", success: true });
    const second = await session.accept({ type: "FINISHED", success: true });

    expect(second).toEqual(first);
    expect(saveTask).toHaveBeenCalledOnce();
  });
});
