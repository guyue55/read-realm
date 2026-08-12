import { describe, expect, it, vi } from "vitest";
import type { LocalDataSnapshotData } from "@reader/shared-types";
import {
  createLocalDataBackup,
  restoreLocalDataBackupToEmptyTarget,
  type LocalDataSnapshotRestoreTarget,
} from "./local-backup-service";
import { parseLocalDataSnapshot } from "./local-snapshot";

const data: LocalDataSnapshotData = {
  books: [
    {
      id: "book-1",
      title: "纵向切片",
      sourceType: "upload",
      format: "txt",
      status: "reading",
      tags: [],
      chapterCount: 1,
      createdAt: "2026-08-13T05:30:00+08:00",
      updatedAt: "2026-08-13T05:30:00+08:00",
    },
  ],
  chapters: [
    {
      id: "chapter-1",
      bookId: "book-1",
      index: 0,
      title: "第一章",
      content: "清晨，林舟推开了窗。",
    },
  ],
  progress: [
    {
      bookId: "book-1",
      chapterId: "chapter-1",
      chapterIndex: 0,
      offset: 36,
      percentage: 10,
      updatedAt: "2026-08-13T05:31:00+08:00",
    },
  ],
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

function emptyTarget() {
  let current: LocalDataSnapshotData = {
    ...structuredClone(data),
    books: [],
    chapters: [],
    progress: [],
    bookmarks: [],
    fileRefs: [],
  };
  const target: LocalDataSnapshotRestoreTarget = {
    isEmpty: vi.fn(async () => current.books.length === 0),
    replaceEmptyTarget: vi.fn(async (next) => {
      current = structuredClone(next);
    }),
    readRestoredData: vi.fn(async () => structuredClone(current)),
    clearFailedRestore: vi.fn(async () => {
      current = {
        ...structuredClone(data),
        books: [],
        chapters: [],
        progress: [],
        bookmarks: [],
        fileRefs: [],
      };
    }),
  };
  return { target, current: () => structuredClone(current) };
}

describe("local backup service", () => {
  it("creates a validated stable snapshot with explicit versions", async () => {
    const serialized = await createLocalDataBackup({
      reader: { readSnapshotData: async () => structuredClone(data) },
      appVersion: "0.1.0",
      databaseVersion: 9,
      now: () => "2026-08-13T05:32:00+08:00",
    });

    expect(parseLocalDataSnapshot(serialized)).toEqual({
      kind: "read-realm-local-snapshot",
      schemaVersion: 1,
      createdAt: "2026-08-13T05:32:00+08:00",
      source: { appVersion: "0.1.0", databaseVersion: 9 },
      data,
    });
  });

  it("restores only into an empty target and verifies exact readback", async () => {
    const serialized = await createLocalDataBackup({
      reader: { readSnapshotData: async () => structuredClone(data) },
      appVersion: "0.1.0",
      databaseVersion: 9,
    });
    const memory = emptyTarget();

    const result = await restoreLocalDataBackupToEmptyTarget({
      serialized,
      target: memory.target,
    });

    expect(result).toEqual({
      status: "restored",
      bookCount: 1,
      chapterCount: 1,
      progressCount: 1,
      bookmarkCount: 0,
    });
    expect(memory.current()).toEqual(data);
  });

  it("refuses to overwrite a non-empty target", async () => {
    const serialized = await createLocalDataBackup({
      reader: { readSnapshotData: async () => structuredClone(data) },
      appVersion: "0.1.0",
      databaseVersion: 9,
    });
    const memory = emptyTarget();
    memory.target.isEmpty = vi.fn(async () => false);

    await expect(
      restoreLocalDataBackupToEmptyTarget({
        serialized,
        target: memory.target,
      }),
    ).rejects.toThrow("LOCAL_DATA_RESTORE_TARGET_NOT_EMPTY");

    expect(memory.target.replaceEmptyTarget).not.toHaveBeenCalled();
  });

  it("clears a failed partial restore when readback differs", async () => {
    const serialized = await createLocalDataBackup({
      reader: { readSnapshotData: async () => structuredClone(data) },
      appVersion: "0.1.0",
      databaseVersion: 9,
    });
    const memory = emptyTarget();
    memory.target.readRestoredData = vi.fn(async () => ({
      ...structuredClone(data),
      progress: [],
    }));

    await expect(
      restoreLocalDataBackupToEmptyTarget({
        serialized,
        target: memory.target,
      }),
    ).rejects.toThrow("LOCAL_DATA_RESTORE_FAILED_CLEANED");

    expect(memory.target.clearFailedRestore).toHaveBeenCalledOnce();
    expect(memory.current().books).toEqual([]);
  });

  it("reports cleanup failure together with the restore error", async () => {
    const serialized = await createLocalDataBackup({
      reader: { readSnapshotData: async () => structuredClone(data) },
      appVersion: "0.1.0",
      databaseVersion: 9,
    });
    const memory = emptyTarget();
    memory.target.replaceEmptyTarget = vi.fn(async () => {
      throw new Error("INJECTED_RESTORE_FAILURE");
    });
    memory.target.clearFailedRestore = vi.fn(async () => {
      throw new Error("INJECTED_CLEANUP_FAILURE");
    });

    await expect(
      restoreLocalDataBackupToEmptyTarget({
        serialized,
        target: memory.target,
      }),
    ).rejects.toThrow(
      "LOCAL_DATA_RESTORE_FAILED_CLEANUP_FAILED:INJECTED_RESTORE_FAILURE:INJECTED_CLEANUP_FAILURE",
    );
  });
});
