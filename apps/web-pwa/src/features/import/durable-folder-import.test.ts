import { describe, expect, it } from "vitest";
import { createImportTaskDraft, transitionImportTask, type DurableImportTask } from "@reader/storage-core";
import { commitDurableFolderImport } from "./durable-folder-import";

const now = "2026-08-13T13:30:00+08:00";

function previewTask(): DurableImportTask {
  const queued = createImportTaskDraft({
    id: "folder-task",
    filename: "本地书库",
    format: "unknown",
    sourceKind: "folder",
    now,
  });
  const reading = transitionImportTask(queued, { type: "reading", at: now });
  const parsing = transitionImportTask(reading, { type: "parsing", at: now, totalChapters: null });
  const scanned = transitionImportTask(parsing, {
    type: "scanProgress",
    at: now,
    scannedFiles: 2,
    scannedDirectories: 1,
  });
  return transitionImportTask(scanned, { type: "preview", at: now });
}

const plan = {
  source: {
    id: "source-1",
    name: "本地书库",
    type: "browser_directory" as const,
    rootName: "本地书库",
    permissionState: "granted" as const,
    scanMode: "manual" as const,
    createdAt: now,
    updatedAt: now,
  },
  folders: [],
  books: [],
  indexedFiles: [],
};

describe("durable folder import commit", () => {
  it("writes metadata and completed task in one transaction", async () => {
    let stored = previewTask();
    const written: string[] = [];
    const port = {
      transaction: async (operation: (transaction: {
        getTask(taskId: string): Promise<DurableImportTask | undefined>;
        putTask(task: DurableImportTask): Promise<void>;
        putSource(source: never): Promise<void>;
        addFolders(folders: never[]): Promise<void>;
        addBooks(books: never[]): Promise<void>;
        addIndexedFiles(files: never[]): Promise<void>;
      }) => Promise<void>) => operation({
        getTask: async () => stored,
        putTask: async (task) => { stored = task; },
        putSource: async () => { written.push("metadata"); },
        addFolders: async () => undefined,
        addBooks: async () => undefined,
        addIndexedFiles: async () => undefined,
      }),
    };

    await commitDurableFolderImport({
      port,
      taskId: "folder-task",
      plan,
      now: () => now,
    });

    expect(written).toEqual(["metadata"]);
    expect(stored.lifecycle.state).toBe("completed");
  });

  it("does not fabricate completion when metadata writing fails", async () => {
    const original = previewTask();
    let stored = original;
    const port = {
      transaction: async (operation: (transaction: {
        getTask(taskId: string): Promise<DurableImportTask | undefined>;
        putTask(task: DurableImportTask): Promise<void>;
        putSource(source: never): Promise<void>;
        addFolders(folders: never[]): Promise<void>;
        addBooks(books: never[]): Promise<void>;
        addIndexedFiles(files: never[]): Promise<void>;
      }) => Promise<void>) => {
        const before = structuredClone(stored);
        try {
          await operation({
            getTask: async () => stored,
            putTask: async (task) => { stored = task; },
            putSource: async () => { throw new Error("quota"); },
            addFolders: async () => undefined,
            addBooks: async () => undefined,
            addIndexedFiles: async () => undefined,
          });
        } catch (error) {
          stored = before;
          throw error;
        }
      },
    };

    await expect(commitDurableFolderImport({
      port,
      taskId: "folder-task",
      plan,
      now: () => now,
    })).rejects.toThrow("quota");
    expect(stored).toEqual(original);
  });
});
