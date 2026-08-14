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
      JSON.stringify({
        "token-a::book-1": { bookId: "book-1", action: "upload", shareToken: "token-a" },
        "token-a::book-2": { bookId: "book-2", action: "download", shareToken: "token-a" },
      }),
    );

    expect(readSyncTasks(storage)).toEqual({
      "token-a::book-1": { bookId: "book-1", action: "upload", shareToken: "token-a" },
      "token-a::book-2": { bookId: "book-2", action: "download", shareToken: "token-a" },
    });
  });

  it.each([
    ["damaged JSON", "{"],
    ["an array", '["upload"]'],
    ["a scalar", '"upload"'],
    ["an old unscoped task", JSON.stringify({ "book-1": "download" })],
    ["an invalid action", JSON.stringify({ "token-a::book-1": { bookId: "book-1", action: "sync", shareToken: "token-a" } })],
    ["a mismatched key", JSON.stringify({ wrong: { bookId: "book-1", action: "upload", shareToken: "token-a" } })],
    ["a dangerous book id", '{"token-a::__proto__":{"bookId":"__proto__","action":"upload","shareToken":"token-a"}}'],
  ])("removes %s and returns an empty object", (_label, initial) => {
    const storage = createMemoryStorage(initial);

    expect(readSyncTasks(storage)).toEqual({});
    expect(storage.getItem(ACTIVE_SYNC_TASKS_KEY)).toBeNull();
  });
});

describe("sync task mutations", () => {
  it("marks and clears a validated task without losing other tasks", () => {
    const storage = createMemoryStorage();

    markSyncTask(storage, "same-book", "upload", "token-a");
    markSyncTask(storage, "same-book", "download", "token-b");
    expect(Object.values(readSyncTasks(storage))).toEqual([
      { bookId: "same-book", action: "upload", shareToken: "token-a" },
      { bookId: "same-book", action: "download", shareToken: "token-b" },
    ]);

    clearSyncTask(storage, "same-book", "token-a");
    expect(Object.values(readSyncTasks(storage))).toEqual([
      { bookId: "same-book", action: "download", shareToken: "token-b" },
    ]);
  });
});
