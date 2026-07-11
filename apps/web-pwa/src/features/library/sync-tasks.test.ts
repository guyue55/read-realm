import { describe, expect, it } from "vitest";
import {
  ACTIVE_SYNC_TASKS_KEY,
  clearSyncTask,
  markSyncTask,
  readSyncTasks,
} from "./sync-tasks";

function createMemoryStorage(initial?: string): Storage {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set(ACTIVE_SYNC_TASKS_KEY, initial);
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => {
      data.delete(key);
    },
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

describe("readSyncTasks", () => {
  it("returns an empty object when no tasks are stored", () => {
    expect(readSyncTasks(createMemoryStorage())).toEqual({});
  });

  it("returns a validated task object", () => {
    const storage = createMemoryStorage(
      JSON.stringify({ "book-1": "upload", "book-2": "download" }),
    );

    expect(readSyncTasks(storage)).toEqual({
      "book-1": "upload",
      "book-2": "download",
    });
  });

  it.each([
    ["damaged JSON", "{"],
    ["an array", '["upload"]'],
    ["a scalar", '"upload"'],
    ["an invalid action", JSON.stringify({ "book-1": "sync" })],
    ["an empty book id", JSON.stringify({ "": "upload" })],
    ["a dangerous book id", '{"__proto__":"upload"}'],
  ])("removes %s and returns an empty object", (_label, initial) => {
    const storage = createMemoryStorage(initial);

    expect(readSyncTasks(storage)).toEqual({});
    expect(storage.getItem(ACTIVE_SYNC_TASKS_KEY)).toBeNull();
  });
});

describe("sync task mutations", () => {
  it("marks and clears a validated task without losing other tasks", () => {
    const storage = createMemoryStorage(JSON.stringify({ first: "upload" }));

    markSyncTask(storage, "second", "download");
    expect(readSyncTasks(storage)).toEqual({ first: "upload", second: "download" });

    clearSyncTask(storage, "first");
    expect(readSyncTasks(storage)).toEqual({ second: "download" });
  });
});
