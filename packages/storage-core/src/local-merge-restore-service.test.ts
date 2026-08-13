import { describe, expect, it, vi } from "vitest";
import type { LocalDataSnapshotData } from "@reader/shared-types";
import {
  executeLocalDataMergeRestore,
  type LocalDataMergeRestoreTarget,
} from "./local-merge-restore-service";

function emptyData(): LocalDataSnapshotData {
  return {
    books: [],
    chapters: [],
    progress: [],
    bookmarks: [],
    settings: {
      fontFamily: "kaiti",
      fontSize: 18,
      lineHeight: 1.7,
      theme: "paper",
      pageMode: "scroll",
      uiMode: "default",
      paragraphSpacing: 16,
      letterSpacing: 0.03,
      autoFlipAtBottom: false,
    },
    fileRefs: [],
  };
}

function incomingData(): LocalDataSnapshotData {
  const data = emptyData();
  data.books.push({
    id: "book-1",
    title: "恢复事务",
    sourceType: "upload",
    format: "txt",
    status: "reading",
    tags: [],
    chapterCount: 1,
    createdAt: "2026-08-13T23:20:00+08:00",
    updatedAt: "2026-08-13T23:20:00+08:00",
  });
  data.chapters.push({
    id: "chapter-1",
    bookId: "book-1",
    index: 0,
    title: "第一章",
    content: "恢复正文",
  });
  return data;
}

function memoryTarget(initial: LocalDataSnapshotData) {
  let current = structuredClone(initial);
  const target: LocalDataMergeRestoreTarget = {
    readCurrent: vi.fn(async () => structuredClone(current)),
    replaceCurrent: vi.fn(async (next) => {
      current = structuredClone(next);
    }),
  };
  return { target, current: () => structuredClone(current) };
}

describe("local merge restore service", () => {
  it("writes an executable plan and verifies exact readback", async () => {
    const memory = memoryTarget(emptyData());

    const result = await executeLocalDataMergeRestore({
      incoming: incomingData(),
      target: memory.target,
    });

    expect(result.status).toBe("merged");
    expect(result.summary.addedBooks).toBe(1);
    expect(memory.current().books[0]?.title).toBe("恢复事务");
    expect(memory.target.replaceCurrent).toHaveBeenCalledOnce();
  });

  it("refuses unresolved conflicts before any write", async () => {
    const current = incomingData();
    const incoming = incomingData();
    incoming.books[0]!.title = "冲突标题";
    const memory = memoryTarget(current);

    await expect(
      executeLocalDataMergeRestore({ incoming, target: memory.target }),
    ).rejects.toThrow("LOCAL_DATA_MERGE_UNRESOLVED_CONFLICTS:book:book-1");

    expect(memory.target.replaceCurrent).not.toHaveBeenCalled();
    expect(memory.current()).toEqual(current);
  });

  it("restores and verifies the old snapshot after readback mismatch", async () => {
    const current = emptyData();
    const memory = memoryTarget(current);
    memory.target.readCurrent = vi
      .fn()
      .mockResolvedValueOnce(structuredClone(current))
      .mockResolvedValueOnce(emptyData())
      .mockResolvedValueOnce(structuredClone(current));

    await expect(
      executeLocalDataMergeRestore({
        incoming: incomingData(),
        target: memory.target,
      }),
    ).rejects.toThrow("LOCAL_DATA_MERGE_FAILED_ROLLED_BACK:LOCAL_DATA_MERGE_READBACK_MISMATCH");

    expect(memory.target.replaceCurrent).toHaveBeenCalledTimes(2);
    expect(memory.current()).toEqual(current);
  });

  it("reports rollback verification failure without hiding the original error", async () => {
    const current = emptyData();
    const memory = memoryTarget(current);
    memory.target.replaceCurrent = vi
      .fn()
      .mockRejectedValueOnce(new Error("INJECTED_WRITE_FAILURE"))
      .mockRejectedValueOnce(new Error("INJECTED_ROLLBACK_FAILURE"));

    await expect(
      executeLocalDataMergeRestore({
        incoming: incomingData(),
        target: memory.target,
      }),
    ).rejects.toThrow(
      "LOCAL_DATA_MERGE_FAILED_ROLLBACK_FAILED:INJECTED_WRITE_FAILURE:INJECTED_ROLLBACK_FAILURE",
    );
  });
});
