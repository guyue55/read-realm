export const ACTIVE_SYNC_TASKS_KEY = "reader-active-sync-tasks";

export type ActiveSyncTasks = Record<string, "upload" | "download">;

const UNSAFE_BOOK_IDS = new Set(["__proto__", "constructor", "prototype"]);

function isValidBookId(bookId: string): boolean {
  return bookId.trim().length > 0 && !UNSAFE_BOOK_IDS.has(bookId);
}

function clearInvalidTasks(storage: Storage): ActiveSyncTasks {
  storage.removeItem(ACTIVE_SYNC_TASKS_KEY);
  return {};
}

export function readSyncTasks(storage: Storage): ActiveSyncTasks {
  const raw = storage.getItem(ACTIVE_SYNC_TASKS_KEY);
  if (raw === null) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return clearInvalidTasks(storage);
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return clearInvalidTasks(storage);
  }

  const tasks: ActiveSyncTasks = {};
  for (const [bookId, action] of Object.entries(parsed)) {
    if (
      !isValidBookId(bookId) ||
      (action !== "upload" && action !== "download")
    ) {
      return clearInvalidTasks(storage);
    }
    tasks[bookId] = action;
  }

  return tasks;
}

export function writeSyncTasks(storage: Storage, tasks: ActiveSyncTasks): void {
  storage.setItem(ACTIVE_SYNC_TASKS_KEY, JSON.stringify(tasks));
}

export function markSyncTask(
  storage: Storage,
  bookId: string,
  action: ActiveSyncTasks[string],
): void {
  if (!isValidBookId(bookId)) return;
  writeSyncTasks(storage, { ...readSyncTasks(storage), [bookId]: action });
}

export function clearSyncTask(storage: Storage, bookId: string): void {
  const tasks = readSyncTasks(storage);
  delete tasks[bookId];
  writeSyncTasks(storage, tasks);
}
